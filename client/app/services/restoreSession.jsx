import { map } from "lodash";
import React from "react";
import Modal from "antd/lib/modal";
import { Auth } from "@/services/auth";

const SESSION_RESTORED_MESSAGE = "redash_session_restored";

// The restore-session popup is opened with `Auth.getLoginUrl()`, which is a Redash-relative
// path ("login" by default), so the only legitimate sender of SESSION_RESTORED_MESSAGE is a
// Redash page running on this very same origin (it posts back via `notifySessionRestored`).
// Compare the full origin string for equality -- never a prefix/substring match, which
// "https://redash.example.com.evil.com" would satisfy -- and also verify the message shape,
// because other libraries legitimately post unrelated messages to this window.
function isSessionRestoredMessage(event) {
  return (
    event.origin === window.location.origin &&
    !!event.data &&
    typeof event.data === "object" &&
    event.data.type === SESSION_RESTORED_MESSAGE
  );
}

export function notifySessionRestored() {
  if (window.opener) {
    window.opener.postMessage({ type: SESSION_RESTORED_MESSAGE }, window.location.origin);
  }
}

function getPopupPosition(width, height) {
  const windowLeft = window.screenX;
  const windowTop = window.screenY;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  return {
    left: Math.floor((windowWidth - width) / 2 + windowLeft),
    top: Math.floor((windowHeight - height) / 2 + windowTop),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function showRestoreSessionPrompt(loginUrl, onSuccess) {
  let popup = null;

  Modal.warning({
    content: "Your session has expired. Please login to continue.",
    okText: (
      <React.Fragment>
        Login <i className="fa fa-external-link m-r-5" aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </React.Fragment>
    ),
    centered: true,
    mask: true,
    maskClosable: false,
    keyboard: false,
    onOk: (closeModal) => {
      if (popup && !popup.closed) {
        popup.focus();
        return; // popup already shown
      }

      const popupOptions = {
        ...getPopupPosition(640, 640),
        menubar: "no",
        toolbar: "no",
        location: "yes",
        resizable: "yes",
        scrollbars: "yes",
        status: "yes",
      };

      popup = window.open(loginUrl, "Restore Session", map(popupOptions, (value, key) => `${key}=${value}`).join(","));

      const handlePostMessage = (event) => {
        // Silently ignore messages from other origins and any unrelated message on this window.
        if (!isSessionRestoredMessage(event)) {
          return;
        }

        if (popup) {
          popup.close();
        }
        popup = null;
        window.removeEventListener("message", handlePostMessage);
        closeModal();
        onSuccess();
      };

      window.addEventListener("message", handlePostMessage, false);
    },
  });
}

let restoreSessionPromise = null;

export function restoreSession() {
  if (!restoreSessionPromise) {
    restoreSessionPromise = new Promise((resolve) => {
      showRestoreSessionPrompt(Auth.getLoginUrl(), () => {
        restoreSessionPromise = null;
        resolve();
      });
    });
  }

  return restoreSessionPromise;
}
