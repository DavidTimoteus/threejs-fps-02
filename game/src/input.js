// First-person mouse look and tactical keyboard input.
// Zero-allocation input state tracking pointer lock, mouse buttons, and key presses.

export function createInput(domElement, onLockChange) {
  const keys = new Set();
  const mouse = { left: false, right: false };
  let lookDx = 0;
  let lookDy = 0;
  let buyPressed = false;
  let usePressed = false;
  let slotRequested = null;
  let sensMultiplier = 1.0;

  function onKeyDown(event) {
    keys.add(event.code);
    if (event.code === 'KeyB') buyPressed = true;
    if (event.code === 'KeyE') usePressed = true;
    if (event.code === 'Digit1') slotRequested = 1;
    if (event.code === 'Digit2') slotRequested = 2;
    if (event.code === 'Digit3') slotRequested = 3;
    if (event.code === 'Digit4') slotRequested = 4;
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseDown(event) {
    if (event.button === 0) mouse.left = true;
    if (event.button === 2) mouse.right = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) mouse.left = false;
    if (event.button === 2) mouse.right = false;
  }

  function onMouseMove(event) {
    if (document.pointerLockElement !== domElement) return;
    lookDx += event.movementX * sensMultiplier;
    lookDy += event.movementY * sensMultiplier;
  }

  function onPointerLockChange() {
    const isLocked = document.pointerLockElement === domElement;
    if (!isLocked) {
      mouse.left = false;
      mouse.right = false;
      keys.clear();
    }
    onLockChange(isLocked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  const lookReturn = { x: 0, y: 0 };

  return {
    state: {
      keys,
      mouse,
      get firing() { return mouse.left; },
      get aiming() { return mouse.right; },
      get isCrouching() { return keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight'); },
      get isWalking() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
      get isJumping() { return keys.has('Space'); },
    },
    takeLook() {
      lookReturn.x = lookDx;
      lookReturn.y = lookDy;
      lookDx = 0;
      lookDy = 0;
      return lookReturn;
    },
    takeBuyKey() {
      const res = buyPressed;
      buyPressed = false;
      return res;
    },
    takeUseKey() {
      const res = usePressed;
      usePressed = false;
      return res;
    },
    takeSlotRequest() {
      const res = slotRequested;
      slotRequested = null;
      return res;
    },
    setSensitivityScale(scale) {
      sensMultiplier = scale;
    },
    requestLock() {
      domElement.requestPointerLock();
    },
    exitLock() {
      if (document.pointerLockElement === domElement) document.exitPointerLock();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    }
  };
}
