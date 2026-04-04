const JOYSTICK_RADIUS = 55;
const JOYSTICK_DEADZONE = 0.2;
const LOOK_SENSITIVITY_X = 1.8;
const LOOK_SENSITIVITY_Y = 1.4;
const BUTTON_SIZE = 64;

export class TouchController {
    static isTouchDevice() {
        return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }

    constructor(container) {
        this.container = container;
        this.state = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false,
            reload: false,
            melee: false,
            fire: false,
            lookX: 0,
            lookY: 0,
            pendingLookX: 0,
            pendingLookY: 0,
        };
        this._edgeState = { reload: false, melee: false };

        this._joystickActive = false;
        this._joystickTouchId = null;
        this._joystickOriginX = 0;
        this._joystickOriginY = 0;
        this._joystickDX = 0;
        this._joystickDY = 0;

        this._lookTouchId = null;
        this._lastLookX = 0;
        this._lastLookY = 0;

        this._sprintToggled = false;

        this._buildUI();
        this._bindEvents();
    }

    _el(tag, styles) {
        const el = document.createElement(tag);
        Object.assign(el.style, styles);
        return el;
    }

    _buildUI() {
        const base = {
            position: "fixed",
            zIndex: "10000",
            pointerEvents: "auto",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
        };

        // Joystick outer ring (fixed)
        this._joystickBase = this._el("div", {
            ...base,
            left: "60px",
            bottom: "60px",
            width: JOYSTICK_RADIUS * 2 + "px",
            height: JOYSTICK_RADIUS * 2 + "px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "2px solid rgba(255,255,255,0.25)",
            transform: "translate(-50%, 50%)",
            display: "none",
        });

        // Joystick thumb (draggable)
        this._joystickThumb = this._el("div", {
            ...base,
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.35)",
            border: "2px solid rgba(255,255,255,0.5)",
            transform: "translate(-50%, 50%)",
            display: "none",
            transition: "none",
        });

        // Action buttons container
        this._buttonsContainer = this._el("div", {
            ...base,
            right: "0",
            bottom: "0",
            display: "none",
        });

        this._fireBtn = this._makeButton("FIRE", {
            right: "20px",
            bottom: "20px",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "rgba(220,40,40,0.5)",
            border: "3px solid rgba(255,80,80,0.7)",
            color: "#fff",
            fontSize: "15px",
            fontWeight: "bold",
            fontFamily: "sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        });

        this._reloadBtn = this._makeButton("R", {
            right: "115px",
            bottom: "95px",
            width: BUTTON_SIZE + "px",
            height: BUTTON_SIZE + "px",
            borderRadius: "50%",
            background: "rgba(60,120,220,0.45)",
            border: "2px solid rgba(100,160,255,0.6)",
            color: "#fff",
            fontSize: "20px",
            fontWeight: "bold",
            fontFamily: "sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        });

        this._meleeBtn = this._makeButton("SHOVE", {
            right: "115px",
            bottom: "20px",
            width: BUTTON_SIZE + "px",
            height: BUTTON_SIZE + "px",
            borderRadius: "50%",
            background: "rgba(200,160,40,0.45)",
            border: "2px solid rgba(240,200,60,0.6)",
            color: "#fff",
            fontSize: "13px",
            fontWeight: "bold",
            fontFamily: "sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        });

        this._sprintBtn = this._makeButton("RUN", {
            right: "200px",
            bottom: "20px",
            width: BUTTON_SIZE + "px",
            height: BUTTON_SIZE + "px",
            borderRadius: "50%",
            background: "rgba(60,180,80,0.35)",
            border: "2px solid rgba(80,220,100,0.5)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "bold",
            fontFamily: "sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        });

        this._buttonsContainer.append(this._fireBtn, this._reloadBtn, this._meleeBtn, this._sprintBtn);
        this.container.append(this._joystickBase, this._joystickThumb, this._buttonsContainer);
    }

    _makeButton(label, styles) {
        const btn = this._el("div", styles);
        btn.textContent = label;
        btn.dataset.touchButton = label;
        return btn;
    }

    _bindEvents() {
        const opts = { passive: false };
        this.container.addEventListener("touchstart", this._onTouchStart.bind(this), opts);
        this.container.addEventListener("touchmove", this._onTouchMove.bind(this), opts);
        this.container.addEventListener("touchend", this._onTouchEnd.bind(this), opts);
        this.container.addEventListener("touchcancel", this._onTouchEnd.bind(this), opts);
    }

    _isOnButton(touch) {
        const t = document.elementFromPoint(touch.clientX, touch.clientY);
        return t && t.dataset && t.dataset.touchButton;
    }

    _onTouchStart(e) {
        if (!e.target.closest('.overlay')) {
            e.preventDefault();
        }
        const w = window.innerWidth;

        for (const touch of e.changedTouches) {
            const x = touch.clientX;
            const y = touch.clientY;
            const id = touch.identifier;

            // Button presses
            if (this._isOnButton(touch)) {
                this._handleButtonPress(touch);
                continue;
            }

            // Left 40% → joystick
            if (x < w * 0.4 && this._joystickTouchId === null) {
                this._startJoystick(id, x, y);
                continue;
            }

            // Right 60% → look
            if (x >= w * 0.4 && this._lookTouchId === null) {
                this._startLook(id, x, y);
            }
        }
    }

    _onTouchMove(e) {
        if (!e.target.closest('.overlay')) {
            e.preventDefault();
        }
        for (const touch of e.changedTouches) {
            const id = touch.identifier;
            if (id === this._joystickTouchId) {
                this._moveJoystick(touch.clientX, touch.clientY);
            } else if (id === this._lookTouchId) {
                this._moveLook(touch.clientX, touch.clientY);
            }
        }
    }

    _onTouchEnd(e) {
        for (const touch of e.changedTouches) {
            const id = touch.identifier;
            if (id === this._joystickTouchId) {
                this._releaseJoystick();
            } else if (id === this._lookTouchId) {
                this._releaseLook();
            }
            this._handleButtonRelease(touch);
        }
    }

    _startJoystick(id, x, y) {
        this._joystickTouchId = id;
        this._joystickOriginX = x;
        this._joystickOriginY = y;
        this._joystickDX = 0;
        this._joystickDY = 0;
        this._joystickActive = true;

        this._joystickBase.style.display = "block";
        this._joystickBase.style.left = x + "px";
        this._joystickBase.style.bottom = (window.innerHeight - y) + "px";
        this._joystickBase.style.transform = "translate(-50%, 50%)";

        this._joystickThumb.style.display = "block";
        this._joystickThumb.style.left = x + "px";
        this._joystickThumb.style.bottom = (window.innerHeight - y) + "px";
        this._joystickThumb.style.transform = "translate(-50%, 50%)";
    }

    _moveJoystick(x, y) {
        let dx = x - this._joystickOriginX;
        let dy = y - this._joystickOriginY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = JOYSTICK_RADIUS;

        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        this._joystickDX = dx;
        this._joystickDY = dy;

        const thumbX = this._joystickOriginX + dx;
        const thumbY = this._joystickOriginY + dy;

        this._joystickThumb.style.left = thumbX + "px";
        this._joystickThumb.style.bottom = (window.innerHeight - thumbY) + "px";

        // Update movement state
        const nx = dx / maxDist;
        const ny = dy / maxDist;

        this.state.forward = ny < -JOYSTICK_DEADZONE;
        this.state.backward = ny > JOYSTICK_DEADZONE;
        this.state.left = nx < -JOYSTICK_DEADZONE;
        this.state.right = nx > JOYSTICK_DEADZONE;
    }

    _releaseJoystick() {
        this._joystickTouchId = null;
        this._joystickActive = false;
        this._joystickDX = 0;
        this._joystickDY = 0;

        this._joystickBase.style.display = "none";
        this._joystickThumb.style.display = "none";

        this.state.forward = false;
        this.state.backward = false;
        this.state.left = false;
        this.state.right = false;
    }

    _startLook(id, x, y) {
        this._lookTouchId = id;
        this._lastLookX = x;
        this._lastLookY = y;
    }

    _moveLook(x, y) {
        const dx = x - this._lastLookX;
        const dy = y - this._lastLookY;
        this._lastLookX = x;
        this._lastLookY = y;

        this.state.lookX += dx * LOOK_SENSITIVITY_X;
        this.state.lookY += dy * LOOK_SENSITIVITY_Y;
        this.state.pendingLookX += dx;
        this.state.pendingLookY += dy;
    }

    _releaseLook() {
        this._lookTouchId = null;
    }

    _handleButtonPress(touch) {
        const t = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!t || !t.dataset.touchButton) return;

        switch (t.dataset.touchButton) {
            case "FIRE":
                this.state.fire = true;
                break;
            case "R":
                if (!this.state.reload) this._edgeState.reload = true;
                this.state.reload = true;
                break;
            case "SHOVE":
                if (!this.state.melee) this._edgeState.melee = true;
                this.state.melee = true;
                break;
            case "RUN":
                this._sprintToggled = !this._sprintToggled;
                this.state.sprint = this._sprintToggled;
                this._sprintBtn.style.background = this._sprintToggled
                    ? "rgba(60,180,80,0.7)"
                    : "rgba(60,180,80,0.35)";
                break;
        }
    }

    _handleButtonRelease(touch) {
        const t = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!t || !t.dataset.touchButton) return;

        switch (t.dataset.touchButton) {
            case "FIRE":
                this.state.fire = false;
                break;
            case "R":
                this.state.reload = false;
                break;
            case "SHOVE":
                this.state.melee = false;
                break;
        }
    }

    getState() {
        return this.state;
    }

    consumeEdges() {
        const edges = { ...this._edgeState };
        this._edgeState.reload = false;
        this._edgeState.melee = false;
        return edges;
    }

    show() {
        this._buttonsContainer.style.display = "block";
    }

    hide() {
        this._buttonsContainer.style.display = "none";
        this._joystickBase.style.display = "none";
        this._joystickThumb.style.display = "none";
    }

    destroy() {
        this.container.removeChild(this._joystickBase);
        this.container.removeChild(this._joystickThumb);
        this.container.removeChild(this._buttonsContainer);
    }
}
