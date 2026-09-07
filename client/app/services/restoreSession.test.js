jest.mock("antd/lib/modal", () => ({ warning: jest.fn() }));

const SESSION_RESTORED_MESSAGE = "redash_session_restored";

function loadModule() {
  jest.resetModules();
  return {
    Modal: require("antd/lib/modal"),
    restoreSessionService: require("./restoreSession"),
  };
}

// Opens the restore-session prompt and simulates the user clicking "Login",
// returning the handles needed to assert on the message listener's behavior.
function showPrompt() {
  const { Modal, restoreSessionService } = loadModule();

  const promise = restoreSessionService.restoreSession();

  const modalConfig = Modal.warning.mock.calls[0][0];
  const popup = { closed: false, close: jest.fn(), focus: jest.fn() };
  const closeModal = jest.fn();

  window.open = jest.fn(() => popup);
  modalConfig.onOk(closeModal);

  return { closeModal, popup, promise };
}

describe("restoreSession", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ignores a session restored message coming from a foreign origin", () => {
    const { closeModal, popup } = showPrompt();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: SESSION_RESTORED_MESSAGE },
        origin: "https://evil.example.com",
      })
    );

    expect(closeModal).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("ignores an origin that merely starts with the expected one", () => {
    const { closeModal, popup } = showPrompt();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: SESSION_RESTORED_MESSAGE },
        origin: `${window.location.origin}.evil.example.com`,
      })
    );

    expect(closeModal).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("ignores unrelated same-origin messages without breaking them", () => {
    const { closeModal, popup } = showPrompt();

    [undefined, null, "some-string-message", { type: "some-other-library-message" }].forEach((data) => {
      window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin }));
    });

    expect(closeModal).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("restores the session on a same-origin session restored message", async () => {
    const { closeModal, popup, promise } = showPrompt();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: SESSION_RESTORED_MESSAGE },
        origin: window.location.origin,
      })
    );

    expect(popup.close).toHaveBeenCalled();
    expect(closeModal).toHaveBeenCalled();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("notifySessionRestored", () => {
  it("posts the message to the opener using the exact expected origin", () => {
    const { restoreSessionService } = loadModule();
    const opener = { postMessage: jest.fn() };

    Object.defineProperty(window, "opener", { value: opener, writable: true, configurable: true });

    restoreSessionService.notifySessionRestored();

    expect(opener.postMessage).toHaveBeenCalledWith({ type: SESSION_RESTORED_MESSAGE }, window.location.origin);
  });
});
