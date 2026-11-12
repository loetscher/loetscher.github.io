document.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('runner-stage');
    const runner = document.getElementById('runner');
    const ground = stage.querySelector('.ground');
    const status = document.getElementById('movement-status');
    const scoreDisplay = document.getElementById('score');
    const movementButtons = Array.from(document.querySelectorAll('[data-direction]'));
    const obstacleElements = Array.from(document.querySelectorAll('[data-obstacle]'));
    const restartButton = document.getElementById('restart-game');
    const activeSources = new Map();
    const horizontalSpeed = 240;
    const initialWorldSpeed = 200;
    const worldAcceleration = 12;
    const maximumWorldSpeed = 520;
    const gravity = 1300;
    const jumpVelocity = -500;
    const floorHeight = 6;
    const floorBottom = 24;
    const maximumFrameStep = 1 / 30;
    const baseStatus = 'Springe über die Hindernisse!';

    let position = 32;
    let verticalPosition = 0;
    let verticalVelocity = 0;
    let worldSpeed = initialWorldSpeed;
    let worldOffset = 0;
    let obstaclePositions = [];
    let scoredObstacles = new Set();
    let score = 0;
    let previousTimestamp = null;
    let animationFrame = null;
    let gameOver = false;
    let isPaused = false;

    function stageHeight() {
        return stage.getBoundingClientRect().height;
    }

    function stageWidth() {
        return stage.getBoundingClientRect().width;
    }

    function groundPosition() {
        return Math.max(0, stageHeight() - floorBottom - floorHeight - runner.getBoundingClientRect().height);
    }

    function maxPosition() {
        return Math.max(0, stageWidth() - runner.getBoundingClientRect().width);
    }

    function obstacleWidth(index) {
        return obstacleElements[index].getBoundingClientRect().width;
    }

    function obstacleHeight(index) {
        return obstacleElements[index].getBoundingClientRect().height;
    }

    function minimumObstacleWidth() {
        return Math.min(...obstacleElements.map((obstacle, index) => obstacleWidth(index)));
    }

    function horizontalDirection() {
        let direction = 0;
        activeSources.forEach(value => {
            direction += value === 'right' ? 1 : -1;
        });
        return Math.sign(direction);
    }

    function renderPosition() {
        position = Math.max(0, Math.min(position, maxPosition()));
        verticalPosition = Math.max(0, Math.min(verticalPosition, groundPosition()));
        runner.style.left = `${position}px`;
        runner.style.top = `${verticalPosition}px`;
    }

    function renderObstacles() {
        obstaclePositions.forEach((worldPosition, index) => {
            obstacleElements[index].style.left = `${worldPosition - worldOffset}px`;
        });
        ground.style.backgroundPositionX = `${-(worldOffset % 38.4)}px`;
    }

    function nextObstacleGap() {
        return worldSpeed * (1.1 + Math.random() * 0.8);
    }

    function initialObstaclePositions() {
        let nextPosition = stageWidth() + 120;
        return obstacleElements.map((obstacle, index) => {
            if (index > 0) {
                nextPosition += nextObstacleGap();
            }
            return nextPosition;
        });
    }

    function renderStatus() {
        let message = baseStatus;
        if (gameOver) {
            message = 'Autsch! Du bist gegen ein Hindernis gelaufen. Drücke „Neustart“.';
        } else if (isPaused) {
            message = 'Pausiert. Klicke ins Fenster, um weiterzuspielen.';
        } else if (verticalVelocity < 0 || verticalPosition < groundPosition()) {
            message = 'Springt über ein Hindernis!';
        }
        if (status.textContent !== message) {
            status.textContent = message;
        }
    }

    function isEditableTarget(target) {
        return target?.isContentEditable
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
            || Boolean(target?.closest?.('[contenteditable="true"]'));
    }

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

    function stopAnimation() {
        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        previousTimestamp = null;
    }

    function requestGameFrame() {
        if (animationFrame === null && !gameOver && !isPaused) {
            animationFrame = requestAnimationFrame(animate);
        }
    }

    function finishGame() {
        gameOver = true;
        activeSources.clear();
        stopAnimation();
        renderStatus();
    }

    function checkCollision() {
        const runnerRight = position + runner.getBoundingClientRect().width;
        const runnerBottom = verticalPosition + runner.getBoundingClientRect().height;
        return obstaclePositions.some((worldPosition, index) => {
            const obstacleLeft = worldPosition - worldOffset;
            const obstacleTop = stageHeight() - floorBottom - floorHeight - obstacleHeight(index);
            const obstacleRight = obstacleLeft + obstacleWidth(index);
            const overlapsHorizontally = runnerRight > obstacleLeft && position < obstacleRight;
            const overlapsVertically = runnerBottom > obstacleTop
                && verticalPosition < stageHeight() - floorBottom - floorHeight;
            return overlapsHorizontally && overlapsVertically;
        });
    }

    function updateWorld(step) {
        const nextWorldSpeed = Math.min(maximumWorldSpeed, worldSpeed + worldAcceleration * step);
        worldOffset += (worldSpeed + nextWorldSpeed) * 0.5 * step;
        worldSpeed = nextWorldSpeed;
        position += horizontalDirection() * horizontalSpeed * step;
        renderPosition();

        if (verticalVelocity !== 0 || verticalPosition < groundPosition()) {
            verticalPosition += verticalVelocity * step;
            verticalVelocity += gravity * step;
            if (verticalPosition >= groundPosition()) {
                verticalPosition = groundPosition();
                verticalVelocity = 0;
            }
            renderPosition();
        }

        if (checkCollision()) {
            renderObstacles();
            finishGame();
            return false;
        }

        obstaclePositions.forEach((worldPosition, index) => {
            if (!scoredObstacles.has(index)
                && worldPosition - worldOffset + obstacleWidth(index) <= position) {
                scoredObstacles.add(index);
                score += 1;
                scoreDisplay.textContent = String(score);
            }
        });

        obstaclePositions = obstaclePositions.map((worldPosition, index) => {
            if (worldPosition - worldOffset < -obstacleWidth(index)) {
                scoredObstacles.delete(index);
                return Math.max(...obstaclePositions) + nextObstacleGap();
            }
            return worldPosition;
        });
        renderObstacles();

        return true;
    }

    function animate(timestamp) {
        animationFrame = null;
        if (gameOver || isPaused) {
            return;
        }

        const elapsed = previousTimestamp === null
            ? 0
            : Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
        previousTimestamp = timestamp;
        let remaining = elapsed;
        while (remaining > 0) {
            const step = Math.min(maximumFrameStep, minimumObstacleWidth() / (worldSpeed * 2), remaining);
            if (!updateWorld(step)) {
                return;
            }
            remaining -= step;
        }
        renderStatus();
        requestGameFrame();
    }

    function jump() {
        if (gameOver || isPaused || verticalPosition < groundPosition()) {
            return;
        }
        verticalVelocity = jumpVelocity;
        renderStatus();
    }

    function startSource(source, direction) {
        activeSources.set(source, direction);
        requestGameFrame();
    }

    function stopSource(source) {
        activeSources.delete(source);
    }

    function pauseGame() {
        if (gameOver || isPaused) {
            return;
        }
        isPaused = true;
        activeSources.clear();
        stopAnimation();
        renderStatus();
    }

    function resumeGame() {
        if (gameOver || !isPaused || document.hidden) {
            return;
        }
        isPaused = false;
        previousTimestamp = null;
        renderStatus();
        requestGameFrame();
    }

    function startNewGame() {
        stopAnimation();
        activeSources.clear();
        gameOver = false;
        isPaused = document.hidden;
        position = Math.min(32, maxPosition());
        verticalPosition = groundPosition();
        verticalVelocity = 0;
        worldSpeed = initialWorldSpeed;
        worldOffset = 0;
        obstaclePositions = initialObstaclePositions();
        scoredObstacles = new Set();
        score = 0;
        scoreDisplay.textContent = String(score);
        renderPosition();
        renderObstacles();
        renderStatus();
        requestGameFrame();
    }

    document.addEventListener('keydown', event => {
        if (isEditableTarget(event.target)) {
            return;
        }

        const key = event.key.toLowerCase();
        if (key === ' ' || key === 'arrowup' || key === 'w') {
            event.preventDefault();
            if (!event.repeat) {
                jump();
            }
            return;
        }

        const direction = directionFromKey(key);
        if (direction) {
            event.preventDefault();
            startSource(`key:${key}`, direction);
        }
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
            if (direction === 'up') {
                jump();
                return;
            }
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

    window.addEventListener('blur', pauseGame);
    window.addEventListener('focus', resumeGame);
    window.addEventListener('resize', () => {
        if (verticalPosition > groundPosition()) {
            verticalPosition = groundPosition();
            verticalVelocity = 0;
        }
        renderPosition();
        renderObstacles();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseGame();
        } else {
            resumeGame();
        }
    });
    restartButton.addEventListener('click', startNewGame);

    startNewGame();
});
