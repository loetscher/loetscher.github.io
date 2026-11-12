const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const page = fs.readFileSync('zukunftstag/jumpnrun.html', 'utf8');
const gameScript = page.match(/<script src="(jumpnrun[^"?]*\.js)(?:\?[^"]*)?" defer><\/script>/);
assert.ok(gameScript, 'The game page must load a JumpNRun script');

class Element {
    constructor({ width = 0, height = 0, dataset = {}, tagName = '' } = {}) {
        this.width = width;
        this.height = height;
        this.dataset = dataset;
        this.tagName = tagName;
        this.style = {};
        this.textContent = '';
        this.listeners = new Map();
        this.classes = new Set();
        this.classList = {
            add: name => this.classes.add(name),
            remove: name => this.classes.delete(name),
            toggle: (name, force) => {
                if (force) {
                    this.classes.add(name);
                } else {
                    this.classes.delete(name);
                }
            }
        };
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type, properties = {}) {
        const event = {
            target: this,
            currentTarget: this,
            defaultPrevented: false,
            preventDefault() {
                this.defaultPrevented = true;
            },
            ...properties
        };
        (this.listeners.get(type) || []).forEach(listener => listener(event));
        return event;
    }

    getBoundingClientRect() {
        return { width: this.width, height: this.height };
    }

    setPointerCapture(pointerId) {
        this.capturedPointer = pointerId;
    }
}

function createGame({
    stageWidth = 320,
    stageHeight = 192,
    runnerWidth = 48,
    runnerHeight = 56,
    randomValues = [0.25, 0.75, 0.4, 0.6]
} = {}) {
    const stage = new Element({ width: stageWidth, height: stageHeight });
    const ground = new Element();
    stage.querySelector = selector => selector === '.ground' ? ground : null;
    const runner = new Element({ width: runnerWidth, height: runnerHeight });
    const status = new Element();
    const score = new Element();
    const buttons = [
        new Element({ dataset: { direction: 'left' } }),
        new Element({ dataset: { direction: 'up' } }),
        new Element({ dataset: { direction: 'right' } })
    ];
    const obstacles = [new Element({ width: 28 }), new Element({ width: 28 }), new Element({ width: 28 })];
    obstacles.forEach(obstacle => {
        obstacle.dataset.obstacle = '';
    });
    const restart = new Element();
    const elements = {
        'runner-stage': stage,
        runner,
        'movement-status': status,
        score,
        'restart-game': restart
    };
    const documentListeners = new Map();
    const windowElement = new Element();
    let nextFrameId = 1;
    const frames = new Map();
    const gameMath = Object.create(Math);
    gameMath.random = () => randomValues.length > 0 ? randomValues.shift() : 0.5;

    const document = {
        hidden: false,
        addEventListener(type, listener) {
            if (type === 'DOMContentLoaded') {
                listener();
                return;
            }
            const listeners = documentListeners.get(type) || [];
            listeners.push(listener);
            documentListeners.set(type, listeners);
        },
        dispatch(type, properties = {}) {
            const event = {
                target: this,
                currentTarget: this,
                defaultPrevented: false,
                preventDefault() {
                    this.defaultPrevented = true;
                },
                ...properties
            };
            (documentListeners.get(type) || []).forEach(listener => listener(event));
            return event;
        },
        getElementById: id => elements[id],
        querySelectorAll: selector => selector === '[data-obstacle]' ? obstacles : buttons
    };

    vm.runInNewContext(fs.readFileSync(`zukunftstag/${gameScript[1]}`, 'utf8'), {
        document,
        Math: gameMath,
        window: windowElement,
        requestAnimationFrame: callback => {
            const frameId = nextFrameId++;
            frames.set(frameId, callback);
            return frameId;
        },
        cancelAnimationFrame: frameId => frames.delete(frameId)
    });

    return {
        stage,
        runner,
        status,
        score,
        buttons,
        obstacles,
        restart,
        document,
        windowElement,
        frames,
        currentTime: 0,
        runFrame(timestamp) {
            const [frameId, callback] = frames.entries().next().value || [];
            if (callback) {
                frames.delete(frameId);
                this.currentTime = timestamp;
                callback(timestamp);
            }
        }
    };
}

function advance(game, duration, interval = 50) {
    const frames = Math.round(duration / interval);
    for (let frame = 0; frame < frames; frame += 1) {
        game.runFrame(game.currentTime + interval);
    }
}

function obstaclePosition(obstacle) {
    return Number.parseFloat(obstacle.style.left);
}

test('the game page provides the score display expected by the game script', () => {
    assert.match(page, /<script src="jumpnrun[^"?]*\.js\?v=[^"]+" defer><\/script>/);
    assert.match(page, /<span id="score">0<\/span>/);
});

test('the world scrolls and obstacles move toward the runner', () => {
    const game = createGame();
    game.runFrame(0);
    game.runFrame(100);
    assert.ok(obstaclePosition(game.obstacles[0]) > 419.8);
    assert.ok(obstaclePosition(game.obstacles[0]) < 420);
    assert.equal(game.runner.style.top, '106px');
    assert.equal(game.status.textContent, 'Springe über die Hindernisse!');
    assert.equal(game.score.textContent, '0');
});

test('obstacles start with varied gaps', () => {
    const game = createGame({ randomValues: [0, 0.75] });
    const positions = game.obstacles.map(obstaclePosition);

    assert.deepEqual(positions, [440, 660, 1000]);
    assert.notEqual(positions[1] - positions[0], positions[2] - positions[1]);
});

test('world speed stays consistent at different animation frame rates', () => {
    const gameAt30Fps = createGame();
    const gameAt60Fps = createGame();
    gameAt30Fps.runFrame(0);
    gameAt60Fps.runFrame(0);
    advance(gameAt30Fps, 1000, 1000 / 30);
    advance(gameAt60Fps, 1000, 1000 / 60);

    assert.ok(Math.abs(obstaclePosition(gameAt30Fps.obstacles[0]) - obstaclePosition(gameAt60Fps.obstacles[0])) < 0.001);
    assert.ok(Math.abs(obstaclePosition(gameAt60Fps.obstacles[0]) - 234) < 0.2);
});

test('world speed increases over time, pauses do not advance it, and restart resets it', () => {
    const game = createGame({ stageWidth: 5000 });
    game.runFrame(0);
    advance(game, 1000, 1000 / 60);
    const positionAfterOneSecond = obstaclePosition(game.obstacles[0]);
    advance(game, 500, 1000 / 60);
    const positionAfterSecondHalf = obstaclePosition(game.obstacles[0]);
    const distanceFirstSecond = 5120 - positionAfterOneSecond;
    const distanceSecondHalf = positionAfterOneSecond - positionAfterSecondHalf;

    assert.ok(distanceSecondHalf > distanceFirstSecond / 2);

    const positionBeforePause = obstaclePosition(game.obstacles[0]);
    game.windowElement.dispatch('blur');
    game.windowElement.dispatch('focus');
    game.runFrame(game.currentTime + 5000);
    assert.equal(obstaclePosition(game.obstacles[0]), positionBeforePause);

    game.restart.dispatch('click');
    game.runFrame(game.currentTime);
    advance(game, 1000, 1000 / 60);

    const freshGame = createGame({ stageWidth: 5000 });
    freshGame.runFrame(0);
    advance(freshGame, 1000, 1000 / 60);
    assert.ok(Math.abs(obstaclePosition(game.obstacles[0]) - obstaclePosition(freshGame.obstacles[0])) < 0.001);
});

test('left and right controls move the runner, while jump keys launch an arc', () => {
    const game = createGame();
    const rightPress = game.document.dispatch('keydown', { key: 'ArrowRight', target: new Element() });
    assert.equal(rightPress.defaultPrevented, true);
    game.runFrame(0);
    game.runFrame(100);
    assert.ok(Math.abs(Number.parseFloat(game.runner.style.left) - 56) < 0.001);

    game.document.dispatch('keyup', { key: 'ArrowRight' });
    const jumpPress = game.document.dispatch('keydown', { key: ' ', target: new Element() });
    assert.equal(jumpPress.defaultPrevented, true);
    game.runFrame(200);
    game.runFrame(300);
    assert.ok(Number.parseFloat(game.runner.style.top) < 106);
    assert.equal(game.status.textContent, 'Springt über ein Hindernis!');
});

test('a jump clears a passing obstacle and the runner lands again', () => {
    const game = createGame({ randomValues: [0, 0, 0] });
    const initialGap = obstaclePosition(game.obstacles[1]) - obstaclePosition(game.obstacles[0]);
    game.runFrame(0);
    advance(game, 1650);
    assert.ok(obstaclePosition(game.obstacles[0]) < 140);
    assert.equal(game.score.textContent, '0');
    game.document.dispatch('keydown', { key: 'ArrowUp', target: new Element() });
    game.document.dispatch('keyup', { key: 'ArrowUp' });
    advance(game, 900, 25);

    assert.notEqual(game.status.textContent, 'Autsch! Du bist gegen ein Hindernis gelaufen. Drücke „Neustart“.');
    assert.equal(game.runner.style.top, '106px');
    assert.ok(obstaclePosition(game.obstacles[0]) > game.stage.width);
    assert.ok(obstaclePosition(game.obstacles[0]) > obstaclePosition(game.obstacles[2]));
    assert.ok(obstaclePosition(game.obstacles[0]) - obstaclePosition(game.obstacles[2]) > initialGap);
    assert.equal(game.score.textContent, '1');
    advance(game, 100, 25);
    assert.equal(game.score.textContent, '1');
    advance(game, 3000, 25);
    assert.ok(game.status.textContent.startsWith('Autsch!'));
    assert.equal(game.score.textContent, '1');
});

test('a touch jump scores when the obstacle is cleared', () => {
    const game = createGame({ randomValues: [0, 0, 0] });
    const jumpButton = game.buttons.find(button => button.dataset.direction === 'up');
    game.runFrame(0);
    advance(game, 1650, 25);

    jumpButton.dispatch('pointerdown', { pointerId: 7, pointerType: 'touch', button: 0 });
    jumpButton.dispatch('pointerup', { pointerId: 7, pointerType: 'touch', button: 0 });
    advance(game, 900, 25);

    assert.equal(game.score.textContent, '1');
    game.restart.dispatch('click');
    assert.equal(game.score.textContent, '0');
});

test('moving back and forth over the same obstacle does not score twice', () => {
    const game = createGame();
    game.runFrame(0);
    advance(game, 1500, 25);
    game.document.dispatch('keydown', { key: ' ', target: new Element() });
    game.document.dispatch('keydown', { key: 'ArrowRight', target: new Element() });
    while (game.score.textContent === '0' && game.currentTime < 2000) {
        game.runFrame(game.currentTime + 1);
    }
    assert.equal(game.score.textContent, '1');
    game.document.dispatch('keyup', { key: 'ArrowRight' });
    game.document.dispatch('keydown', { key: 'ArrowLeft', target: new Element() });
    advance(game, 150, 25);
    assert.ok(obstaclePosition(game.obstacles[0]) + 28 > Number.parseFloat(game.runner.style.left));
    game.document.dispatch('keyup', { key: 'ArrowLeft' });
    game.document.dispatch('keydown', { key: 'ArrowRight', target: new Element() });
    advance(game, 100, 25);
    assert.ok(obstaclePosition(game.obstacles[0]) + 28 <= Number.parseFloat(game.runner.style.left));
    assert.equal(game.score.textContent, '1');
});

test('a missed jump causes a collision, stops the game, and restart resets it', () => {
    const game = createGame();
    game.runFrame(0);
    for (let timestamp = 50; timestamp <= 5000 && !game.status.textContent.startsWith('Autsch!'); timestamp += 50) {
        game.runFrame(timestamp);
    }
    assert.equal(game.status.textContent, 'Autsch! Du bist gegen ein Hindernis gelaufen. Drücke „Neustart“.');
    assert.equal(game.frames.size, 0);
    assert.equal(game.score.textContent, '0');

    game.restart.dispatch('click');
    assert.equal(game.status.textContent, 'Springe über die Hindernisse!');
    assert.equal(game.runner.style.left, '32px');
    assert.equal(game.runner.style.top, '106px');
    assert.equal(obstaclePosition(game.obstacles[0]), 440);
    assert.equal(game.frames.size, 1);
    assert.equal(game.score.textContent, '0');
});

test('each cleared obstacle scores once, including recycled obstacles, and restart clears the score', () => {
    const game = createGame({ randomValues: [0.5, 0.5, 0.5, 0.5] });
    game.runFrame(0);
    for (let frame = 0; frame < 600 && Number(game.score.textContent) < 4; frame += 1) {
        const upcoming = game.obstacles.find(obstacle => {
            const left = obstaclePosition(obstacle);
            return left >= 105 && left <= 125;
        });
        if (upcoming) {
            game.document.dispatch('keydown', { key: ' ', target: new Element() });
        }
        game.runFrame(game.currentTime + 25);
    }
    assert.notEqual(game.status.textContent, 'Autsch! Du bist gegen ein Hindernis gelaufen. Drücke „Neustart“.');
    assert.equal(game.score.textContent, '4');

    game.windowElement.dispatch('blur');
    assert.equal(game.score.textContent, '4');
    game.windowElement.dispatch('focus');
    game.restart.dispatch('click');
    assert.equal(game.score.textContent, '0');
});

test('the jump button works, but editable targets do not control the game', () => {
    const game = createGame();
    const ignoredKey = game.document.dispatch('keydown', { key: 'w', target: new Element({ tagName: 'INPUT' }) });
    assert.equal(ignoredKey.defaultPrevented, false);

    const jumpButton = game.buttons.find(button => button.dataset.direction === 'up');
    const press = jumpButton.dispatch('pointerdown', { pointerId: 7, button: 0 });
    assert.equal(press.defaultPrevented, true);
    game.runFrame(0);
    game.runFrame(100);
    assert.ok(Number.parseFloat(game.runner.style.top) < 106);
    jumpButton.dispatch('pointerup', { pointerId: 7 });
});

test('the runner stays in the stage, clamps after resizing, and pauses on focus loss', () => {
    const game = createGame({ stageWidth: 200 });
    game.document.dispatch('keydown', { key: 'ArrowLeft', target: new Element() });
    for (let timestamp = 0; timestamp <= 500; timestamp += 100) {
        game.runFrame(timestamp);
    }
    assert.equal(game.runner.style.left, '0px');
    game.document.dispatch('keyup', { key: 'ArrowLeft' });

    const narrowGame = createGame();
    narrowGame.stage.width = 50;
    narrowGame.windowElement.dispatch('resize');
    assert.equal(narrowGame.runner.style.left, '2px');

    game.stage.width = 80;
    game.stage.height = 120;
    game.windowElement.dispatch('resize');
    assert.equal(game.runner.style.left, '0px');
    assert.equal(game.runner.style.top, '34px');
    game.windowElement.dispatch('blur');
    assert.equal(game.status.textContent, 'Pausiert. Klicke ins Fenster, um weiterzuspielen.');
    assert.equal(game.frames.size, 0);
    game.windowElement.dispatch('focus');
    assert.equal(game.frames.size, 1);
    assert.equal(game.status.textContent, 'Springe über die Hindernisse!');

    game.document.hidden = true;
    game.document.dispatch('visibilitychange');
    assert.equal(game.frames.size, 0);
    assert.equal(game.status.textContent, 'Pausiert. Klicke ins Fenster, um weiterzuspielen.');
    game.document.hidden = false;
    game.document.dispatch('visibilitychange');
    assert.equal(game.frames.size, 1);
});
