import re
import time

import mock

from redash import limiter, settings
from redash.authentication.account import invite_token
from redash.models import User
from tests import BaseTestCase, authenticate_request


class TestResetPassword(BaseTestCase):
    def test_shows_reset_password_form(self):
        user = self.factory.create_user(is_invitation_pending=False)
        token = invite_token(user)
        response = self.get_request("/reset/{}".format(token), org=self.factory.org)
        self.assertEqual(response.status_code, 200)


class TestInvite(BaseTestCase):
    def test_expired_invite_token(self):
        with mock.patch("time.time") as patched_time:
            patched_time.return_value = time.time() - (7 * 24 * 3600) - 10
            token = invite_token(self.factory.user)

        response = self.get_request("/invite/{}".format(token), org=self.factory.org)
        self.assertEqual(response.status_code, 400)

    def test_invalid_invite_token(self):
        response = self.get_request("/invite/badtoken", org=self.factory.org)
        self.assertEqual(response.status_code, 400)

    def test_valid_token(self):
        user = self.factory.create_user(is_invitation_pending=True)
        token = invite_token(user)
        response = self.get_request("/invite/{}".format(token), org=self.factory.org)
        self.assertEqual(response.status_code, 200)

    def test_already_active_user(self):
        token = invite_token(self.factory.user)
        self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": "test1234"},
            org=self.factory.org,
        )
        response = self.get_request("/invite/{}".format(token), org=self.factory.org)
        self.assertEqual(response.status_code, 400)


class TestInvitePost(BaseTestCase):
    def test_empty_password(self):
        token = invite_token(self.factory.user)
        response = self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": ""},
            org=self.factory.org,
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_password(self):
        token = invite_token(self.factory.user)
        response = self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": "1234"},
            org=self.factory.org,
        )
        self.assertEqual(response.status_code, 400)

    def test_bad_token(self):
        response = self.post_request(
            "/invite/{}".format("jdsnfkjdsnfkj"),
            data={"csrf_token": self.csrf_token(), "password": "1234"},
            org=self.factory.org,
        )
        self.assertEqual(response.status_code, 400)

    def test_user_invited_before_invitation_pending_check(self):
        user = self.factory.create_user(details={})
        token = invite_token(user)
        response = self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": "test1234"},
            org=self.factory.org,
        )
        self.assertEqual(response.status_code, 302)

    def test_already_active_user(self):
        token = invite_token(self.factory.user)
        self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": "test1234"},
            org=self.factory.org,
        )
        response = self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": "test1234"},
            org=self.factory.org,
        )
        self.assertEqual(response.status_code, 400)

    def test_valid_password(self):
        user = self.factory.create_user(is_invitation_pending=True)
        token = invite_token(user)
        password = "test1234"
        response = self.post_request(
            "/invite/{}".format(token),
            data={"csrf_token": self.csrf_token(), "password": password},
            org=self.factory.org,
        )
        self.assertEqual(response.status_code, 302)
        user = User.query.get(user.id)
        self.assertTrue(user.verify_password(password))
        self.assertFalse(user.is_invitation_pending)


class TestLogin(BaseTestCase):
    def test_throttle_login(self):
        limiter.enabled = True
        # Extract the limit from settings (ex: '50/day')
        limit = settings.THROTTLE_LOGIN_PATTERN.split("/")[0]
        for _ in range(0, int(limit)):
            self.get_request("/login", org=self.factory.org)

        response = self.get_request("/login", org=self.factory.org)
        self.assertEqual(response.status_code, 429)

    def test_throttle_password_reset(self):
        limiter.enabled = True
        # Extract the limit from settings (ex: '10/hour')
        limit = settings.THROTTLE_PASS_RESET_PATTERN.split("/")[0]
        for _ in range(0, int(limit)):
            self.get_request("/forgot", org=self.factory.org)

        response = self.get_request("/forgot", org=self.factory.org)
        self.assertEqual(response.status_code, 429)


class TestFormCSRFProtection(BaseTestCase):
    """The tokens embedded by the server-rendered forms have to be validated.

    ``ENFORCE_CSRF`` is opt-in and only covers the API, so these unauthenticated
    form handlers enforce their own token (see ``redash.security``).
    """

    def rendered_csrf_token(self, path):
        response = self.get_request(path, org=self.factory.org)
        self.assertEqual(response.status_code, 200)
        match = re.search(r'name="csrf_token" value="([^"]+)"', response.data.decode())
        self.assertIsNotNone(match, "no csrf_token rendered in {}".format(path))
        return match.group(1)

    def test_login_rejects_post_without_csrf_token(self):
        user = self.factory.user
        user.hash_password("password")
        self.db.session.add(user)
        self.db.session.commit()

        with mock.patch("redash.handlers.authentication.login_user") as login_user_mock:
            response = self.post_request(
                "/login",
                data={"email": user.email, "password": "password"},
                org=self.factory.org,
            )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(login_user_mock.called)

    def test_login_rejects_post_with_forged_csrf_token(self):
        user = self.factory.user
        user.hash_password("password")
        self.db.session.add(user)
        self.db.session.commit()

        # a session holding a valid secret is not enough, the token has to match it
        self.csrf_token()

        with mock.patch("redash.handlers.authentication.login_user") as login_user_mock:
            response = self.post_request(
                "/login",
                data={
                    "csrf_token": "not-a-valid-token",
                    "email": user.email,
                    "password": "password",
                },
                org=self.factory.org,
            )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(login_user_mock.called)

    def test_login_accepts_the_token_rendered_in_the_form(self):
        user = self.factory.user
        user.hash_password("password")
        self.db.session.add(user)
        self.db.session.commit()

        response = self.post_request(
            "/login",
            data={
                "csrf_token": self.rendered_csrf_token("/login"),
                "email": user.email,
                "password": "password",
            },
            org=self.factory.org,
        )

        self.assertEqual(response.status_code, 302)

    def test_forgot_password_rejects_post_without_csrf_token(self):
        user = self.factory.create_user()

        with mock.patch("redash.handlers.authentication.send_password_reset_email") as send_email_mock:
            response = self.post_request("/forgot", data={"email": user.email}, org=user.org)

        self.assertEqual(response.status_code, 400)
        send_email_mock.assert_not_called()

    def test_invite_rejects_post_without_csrf_token(self):
        user = self.factory.create_user(is_invitation_pending=True)
        token = invite_token(user)

        response = self.post_request(
            "/invite/{}".format(token),
            data={"password": "test1234"},
            org=self.factory.org,
        )

        self.assertEqual(response.status_code, 400)
        user = User.query.get(user.id)
        self.assertTrue(user.is_invitation_pending)
        self.assertFalse(user.verify_password("test1234"))

    def test_reset_rejects_post_without_csrf_token(self):
        user = self.factory.create_user(is_invitation_pending=False)
        user.hash_password("password")
        self.db.session.add(user)
        self.db.session.commit()
        token = invite_token(user)

        response = self.post_request(
            "/reset/{}".format(token),
            data={"password": "test1234"},
            org=self.factory.org,
        )

        self.assertEqual(response.status_code, 400)
        user = User.query.get(user.id)
        self.assertFalse(user.verify_password("test1234"))
        self.assertTrue(user.verify_password("password"))


class TestSession(BaseTestCase):
    # really simple test just to trigger this route
    def test_get(self):
        self.make_request("get", "/default/api/session", user=self.factory.user, org=False)


class TestClientConfig(BaseTestCase):
    def test_base_path_is_built_from_the_configured_host(self):
        authenticate_request(self.client, self.factory.user)

        with mock.patch.object(settings, "HOST", "https://redash.example.com"):
            response = self.client.get("/api/config", headers={"Host": "evil.example.com"})

        self.assertEqual(response.status_code, 200)
        base_path = response.json["client_config"]["basePath"]
        self.assertEqual(base_path, "https://redash.example.com/{}/".format(self.factory.org.slug))
        self.assertNotIn("evil.example.com", base_path)
