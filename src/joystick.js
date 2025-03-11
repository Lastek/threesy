import nipplejs from 'nipplejs';

import * as THREE from 'three';
export let joystick;
export let isMobile = false;

export function init() {
    // Control state
    const state = {
        isTouchingJoystick: false,
        touchIdJoystick: null,
        joystickDirection: new THREE.Vector2(0, 0),
        isJumpPressed: false,
        touchIdJump: null
    };

    // DOM elements
    const joystickBase = document.getElementById('joystick-base');
    const joystickHandle = document.getElementById('joystick-handle');
    const jumpButton = document.getElementById('jump-button');
    const joystickRadius = 50;

    if (!joystickBase || !joystickHandle || !jumpButton) {
        console.error('Mobile control elements not found in DOM');
        return state; // Return early to avoid errors
    }

    // Joystick events
    joystickBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!state.isTouchingJoystick) {
            const touch = e.changedTouches[0];
            state.isTouchingJoystick = true;
            state.touchIdJoystick = touch.identifier;
            updateJoystick(touch);
        }
    });

    joystickBase.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === state.touchIdJoystick);
        if (touch) updateJoystick(touch);
    });

    joystickBase.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === state.touchIdJoystick);
        if (touch) {
            state.isTouchingJoystick = false;
            state.touchIdJoystick = null;
            joystickHandle.style.left = '50%';
            joystickHandle.style.top = '50%';
            state.joystickDirection.set(0, 0);
        }
    });

    function updateJoystick(touch) {
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > joystickRadius) {
            dx = (dx / distance) * joystickRadius;
            dy = (dy / distance) * joystickRadius;
        }

        joystickHandle.style.left = `${50 + (dx / joystickRadius) * 50}%`;
        joystickHandle.style.top = `${50 + (dy / joystickRadius) * 50}%`;
        state.joystickDirection.set(dx / joystickRadius, dy / joystickRadius);
    }

    // Jump button events
    jumpButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!state.isJumpPressed) {
            state.isJumpPressed = true;
            state.touchIdJump = e.changedTouches[0].identifier;
            console.log('Jump button pressed');
        }
    });

    jumpButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === state.touchIdJump);
        if (touch) {
            state.isJumpPressed = false;
            state.touchIdJump = null;
            console.log('Jump button released');
        }
    });

    return state;
};