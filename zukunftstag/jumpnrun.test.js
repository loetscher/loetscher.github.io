const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

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

function createGame({ stageWidth = 320, stageHeight = 192, runnerWidth = 40, runnerHeight = 56 } = {}) {
    const stage = new Element({ width: stageWidth, height: stageHeight });
    const runner = new Element({ width: runnerWidth, height: runnerHeight });
    const status = new Element();
    const buttons = [
        new Element({ dataset: { direction: 'left' } }),
        new Element({ dataset: { direction: 'right' } }),
        new Element({ dataset: { direction: 'up' } }),
        new Element({ dataset: { direction: 'down' } })
    ];
    const elements = {
        'runner-stage': stage,
        runner,
        'movement-status': status
    };
    const documentListeners = new Map();
    const windowElement = new Element();
    let nextFrameId = 1;
    const frames = new Map();

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
        querySelectorAll: () => buttons
    };

    vm.runInNewContext(fs.readFileSync('zukunftstag/jumpnrun.js', 'utf8'), {
        document,
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
        buttons,
        document,
        windowElement,
        frames,
        runFrame(timestamp) {
            const [frameId, callback] = frames.entries().next().value || [];
            if (callback) {
                frames.delete(frameId);
                callback(timestamp);
            }
        }
    };
}

function runAtFrameRate(game, framesPerSecond) {
    const interval = 1000 / framesPerSecond;
    game.document.dispatch('keydown', { key: 'd', target: new Element() });
    for (let frame = 0; frame <= framesPerSecond; frame += 1) {
        game.runFrame(frame * interval);
    }
    game.document.dispatch('keyup', { key: 'd' });
    return Number.parseFloat(game.runner.style.left);
}

test('keyboard movement is held, prevents scrolling, and stops on key release', () => {
    const game = createGame();
    const press = game.document.dispatch('keydown', { key: 'ArrowRight', target: new Element() });

    assert.equal(press.defaultPrevented, true);
    game.runFrame(0);
    game.runFrame(100);
    assert.equal(game.runner.style.left, '24px');

    game.document.dispatch('keyup', { key: 'ArrowRight' });
    assert.equal(game.frames.size, 0);
    assert.equal(game.status.textContent, 'Bereit zum Laufen.');
});

test('movement distance is consistent at different animation frame rates', () => {
    const distanceAt30Fps = runAtFrameRate(createGame(), 30);
    const distanceAt60Fps = runAtFrameRate(createGame(), 60);

    assert.ok(Math.abs(distanceAt30Fps - distanceAt60Fps) < 0.001);
    assert.ok(Math.abs(distanceAt60Fps - 240) < 0.001);
});

test('opposite simultaneous inputs cancel, then the remaining direction moves', () => {
    const game = createGame();
    game.document.dispatch('keydown', { key: 'a', target: new Element() });
    game.document.dispatch('keydown', { key: 'ArrowRight', target: new Element() });
    assert.equal(game.status.textContent, 'Steht still.');
    game.runFrame(0);
    game.runFrame(100);
    assert.equal(game.runner.style.left, '0px');

    game.document.dispatch('keyup', { key: 'a' });
    game.runFrame(200);
    assert.equal(game.runner.style.left, '24px');
});

test('up and down keys move vertically and clamp at both stage edges', () => {
    const game = createGame();
    game.document.dispatch('keydown', { key: 'w', target: new Element() });
    game.runFrame(0);
    game.runFrame(100);
    assert.equal(Number.parseFloat(game.runner.style.top), 83.2);
    assert.equal(game.status.textContent, 'Läuft nach oben.');

    for (let timestamp = 200; timestamp <= 1200; timestamp += 100) {
        game.runFrame(timestamp);
    }
    assert.equal(game.runner.style.top, '0px');

    game.document.dispatch('keyup', { key: 'w' });
    game.document.dispatch('keydown', { key: 'ArrowDown', target: new Element() });
    for (let timestamp = 1300; timestamp <= 2300; timestamp += 100) {
        game.runFrame(timestamp);
    }
    assert.equal(game.runner.style.top, '136px');
    game.document.dispatch('keyup', { key: 'ArrowDown' });
});

test('diagonal movement is normalized and opposite vertical inputs cancel', () => {
    const game = createGame();
    game.document.dispatch('keydown', { key: 'd', target: new Element() });
    game.document.dispatch('keydown', { key: 'w', target: new Element() });
    game.runFrame(0);
    game.runFrame(100);
    assert.ok(Math.abs(Number.parseFloat(game.runner.style.left) - 16.9705627485) < 0.001);
    assert.ok(Math.abs(Number.parseFloat(game.runner.style.top) - (107.2 - 16.9705627485)) < 0.001);
    assert.equal(game.status.textContent, 'Läuft diagonal nach oben rechts.');

    game.document.dispatch('keydown', { key: 's', target: new Element() });
    const topBeforeVerticalCancellation = Number.parseFloat(game.runner.style.top);
    game.runFrame(200);
    assert.ok(Number.parseFloat(game.runner.style.left) > 16.97);
    assert.equal(Number.parseFloat(game.runner.style.top), topBeforeVerticalCancellation);
    assert.equal(game.status.textContent, 'Läuft nach rechts.');
});

test('movement stays inside the stage and is clamped after resizing', () => {
    const game = createGame({ stageWidth: 200, runnerWidth: 40 });
    game.document.dispatch('keydown', { key: 'ArrowLeft', target: new Element() });
    for (let timestamp = 0; timestamp <= 1000; timestamp += 100) {
        game.runFrame(timestamp);
    }
    assert.equal(game.runner.style.left, '0px');
    game.document.dispatch('keyup', { key: 'ArrowLeft' });

    game.document.dispatch('keydown', { key: 'd', target: new Element() });
    for (let timestamp = 0; timestamp <= 2000; timestamp += 100) {
        game.runFrame(timestamp);
    }
    assert.equal(game.runner.style.left, '160px');

    game.stage.width = 80;
    game.stage.height = 80;
    game.windowElement.dispatch('resize');
    assert.equal(game.runner.style.left, '40px');
    assert.equal(game.runner.style.top, '24px');
});

test('direction buttons run while pressed and stop on pointer cancellation', () => {
    const game = createGame();
    const downButton = game.buttons.find(button => button.dataset.direction === 'down');
    const down = downButton.dispatch('pointerdown', { pointerId: 7, button: 0 });
    assert.equal(down.defaultPrevented, true);
    assert.equal(downButton.capturedPointer, 7);
    game.runFrame(0);
    game.runFrame(100);
    assert.equal(game.runner.style.top, '131.2px');

    downButton.dispatch('pointercancel', { pointerId: 7 });
    assert.equal(game.frames.size, 0);
    assert.equal(game.status.textContent, 'Bereit zum Laufen.');
});

test('editable text targets are ignored and focus or page loss stops movement', () => {
    const game = createGame();
    const textInput = new Element({ tagName: 'INPUT' });
    const ignoredKey = game.document.dispatch('keydown', { key: 'd', target: textInput });
    assert.equal(ignoredKey.defaultPrevented, false);
    assert.equal(game.frames.size, 0);

    game.document.dispatch('keydown', { key: 'd', target: new Element() });
    game.windowElement.dispatch('blur');
    assert.equal(game.frames.size, 0);
    assert.equal(game.status.textContent, 'Bereit zum Laufen.');

    game.document.dispatch('keydown', { key: 'a', target: new Element() });
    game.document.hidden = true;
    game.document.dispatch('visibilitychange');
    assert.equal(game.frames.size, 0);
    assert.equal(game.status.textContent, 'Bereit zum Laufen.');
});
