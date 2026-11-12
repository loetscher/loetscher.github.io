document.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('runner-stage');
    const runner = document.getElementById('runner');
    const status = document.getElementById('movement-status');
    const movementButtons = Array.from(document.querySelectorAll('[data-direction]'));
    const activeSources = new Map();
    const speed = 240;

    let position = 0;
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
        return null;
    }

    function getDirection() {
        const directions = new Set(activeSources.values());
        if (directions.size !== 1) {
            return 0;
        }
        return directions.has('right') ? 1 : -1;
    }

    function maxPosition() {
        return Math.max(0, stage.getBoundingClientRect().width - runner.getBoundingClientRect().width);
    }

    function renderPosition() {
        position = Math.max(0, Math.min(position, maxPosition()));
        runner.style.left = `${position}px`;
    }

    function renderMovementState() {
        const direction = getDirection();
        runner.classList.toggle('is-running', direction !== 0);

        if (direction < 0) {
            status.textContent = 'Läuft nach links.';
        } else if (direction > 0) {
            status.textContent = 'Läuft nach rechts.';
        } else if (activeSources.size > 0) {
            status.textContent = 'Steht still.';
        } else {
            status.textContent = 'Bereit zum Laufen.';
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

        const direction = getDirection();
        if (direction !== 0 && previousTimestamp !== null) {
            const elapsedSeconds = Math.max(0, (timestamp - previousTimestamp) / 1000);
            position += direction * speed * elapsedSeconds;
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

    renderPosition();
    renderMovementState();
});
