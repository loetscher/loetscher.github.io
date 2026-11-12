document.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('runner-stage');
    const runner = document.getElementById('runner');
    const status = document.getElementById('movement-status');
    const movementButtons = Array.from(document.querySelectorAll('[data-direction]'));
    const activeSources = new Map();
    const speed = 240;

    let position = 0;
    let verticalPosition = 0;
    let previousTimestamp = null;
    let animationFrame = null;

    function directionFromKey(key) {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey === 'arrowleft' || normalizedKey === 'a') {
            return 'left';
        }
        if (normalizedKey === 'arrowright' || normalizedKey === 'd') {
            return 'right';
        }
        if (normalizedKey === 'arrowup' || normalizedKey === 'w') {
            return 'up';
        }
        if (normalizedKey === 'arrowdown' || normalizedKey === 's') {
            return 'down';
        }
        return null;
    }

    function getMovementVector() {
        let horizontal = 0;
        let vertical = 0;
        activeSources.forEach(direction => {
            if (direction === 'left') {
                horizontal -= 1;
            } else if (direction === 'right') {
                horizontal += 1;
            } else if (direction === 'up') {
                vertical -= 1;
            } else if (direction === 'down') {
                vertical += 1;
            }
        });
        return { x: Math.sign(horizontal), y: Math.sign(vertical) };
    }

    function maxPosition() {
        return Math.max(0, stage.getBoundingClientRect().width - runner.getBoundingClientRect().width);
    }

    function maxVerticalPosition() {
        return Math.max(0, stage.getBoundingClientRect().height - runner.getBoundingClientRect().height);
    }

    function renderPosition() {
        position = Math.max(0, Math.min(position, maxPosition()));
        verticalPosition = Math.max(0, Math.min(verticalPosition, maxVerticalPosition()));
        runner.style.left = `${position}px`;
        runner.style.top = `${verticalPosition}px`;
    }

    function renderMovementState() {
        const { x, y } = getMovementVector();
        if (x === 0 && y === 0) {
            status.textContent = activeSources.size > 0 ? 'Steht still.' : 'Bereit zum Laufen.';
            return;
        }

        if (x !== 0 && y !== 0) {
            const vertical = y < 0 ? 'oben' : 'unten';
            const horizontal = x < 0 ? 'links' : 'rechts';
            status.textContent = `Läuft diagonal nach ${vertical} ${horizontal}.`;
        } else {
            const direction = x < 0 ? 'links' : x > 0 ? 'rechts' : y < 0 ? 'oben' : 'unten';
            status.textContent = `Läuft nach ${direction}.`;
        }
    }

    function requestMovementFrame() {
        if (animationFrame === null) {
            animationFrame = requestAnimationFrame(animate);
        }
    }

    function animate(timestamp) {
        animationFrame = null;
        if (activeSources.size === 0) {
            previousTimestamp = null;
            return;
        }

        const movement = getMovementVector();
        if ((movement.x !== 0 || movement.y !== 0) && previousTimestamp !== null) {
            const elapsedSeconds = Math.max(0, (timestamp - previousTimestamp) / 1000);
            const diagonalScale = movement.x !== 0 && movement.y !== 0 ? Math.SQRT1_2 : 1;
            position += movement.x * speed * elapsedSeconds * diagonalScale;
            verticalPosition += movement.y * speed * elapsedSeconds * diagonalScale;
            renderPosition();
        }
        previousTimestamp = timestamp;
        requestMovementFrame();
    }

    function startSource(source, direction) {
        activeSources.set(source, direction);
        renderMovementState();
        requestMovementFrame();
    }

    function stopSource(source) {
        activeSources.delete(source);
        renderMovementState();
        if (activeSources.size === 0) {
            previousTimestamp = null;
            if (animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
        }
    }

    function clearMovement() {
        activeSources.clear();
        previousTimestamp = null;
        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        renderMovementState();
    }

    function isEditableTarget(target) {
        return target?.isContentEditable
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
            || Boolean(target?.closest?.('[contenteditable="true"]'));
    }

    document.addEventListener('keydown', event => {
        const direction = directionFromKey(event.key);
        if (!direction || isEditableTarget(event.target)) {
            return;
        }

        event.preventDefault();
        startSource(`key:${event.key.toLowerCase()}`, direction);
    });

    document.addEventListener('keyup', event => {
        if (directionFromKey(event.key)) {
            stopSource(`key:${event.key.toLowerCase()}`);
        }
    });

    movementButtons.forEach(button => {
        const direction = button.dataset.direction;
        button.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) {
                return;
            }
            event.preventDefault();
            const pointerId = event.pointerId ?? 'primary';
            startSource(`pointer:${pointerId}`, direction);
            if (button.setPointerCapture) {
                try {
                    button.setPointerCapture(pointerId);
                } catch (error) {
                    // The pointer may already have been cancelled by the browser.
                }
            }
        });

        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(eventName => {
            button.addEventListener(eventName, event => {
                stopSource(`pointer:${event.pointerId ?? 'primary'}`);
            });
        });
    });

    window.addEventListener('blur', clearMovement);
    window.addEventListener('resize', renderPosition);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearMovement();
        }
    });

    verticalPosition = Math.max(0, maxVerticalPosition() - 28.8);
    renderPosition();
    renderMovementState();
});
