const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class Element {
    constructor(dataset = {}) {
        this.dataset = dataset;
        this.value = '';
        this.textContent = '';
        this.listeners = {};
        this.attributes = {};
        this.hidden = false;
        this.disabled = false;
        this.classes = new Set();
        this.classList = {
            add: name => this.classes.add(name),
            remove: name => this.classes.delete(name)
        };
    }

    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }

    click() {
        if (!this.disabled) {
            this.listeners.click?.({ currentTarget: this });
        }
    }

    input() {
        this.listeners.input?.({ currentTarget: this });
    }

    change() {
        this.listeners.change?.({ currentTarget: this });
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    removeAttribute(name) {
        delete this.attributes[name];
        if (name === 'data-mark') {
            delete this.dataset.mark;
        }
    }
}

function createGame({ mode = 'two-player', difficulty = 'hard' } = {}) {
    const cells = Array.from({ length: 9 }, (_, index) => new Element({ cell: String(index) }));
    const elements = {
        output: new Element(),
        restart: new Element(),
        'game-mode': new Element(),
        difficulty: new Element(),
        'difficulty-setting': new Element(),
        'player-x-name': new Element(),
        'player-o-name': new Element()
    };
    elements['game-mode'].value = mode;
    elements.difficulty.value = difficulty;

    let nextTimerId = 1;
    const timers = new Map();
    const document = {
        addEventListener(type, listener) {
            if (type === 'DOMContentLoaded') {
                listener();
            }
        },
        getElementById: id => elements[id],
        querySelectorAll: () => cells
    };

    vm.runInNewContext(fs.readFileSync('zukunftstag/script.js', 'utf8'), {
        document,
        setTimeout: callback => {
            const timerId = nextTimerId++;
            timers.set(timerId, callback);
            return timerId;
        },
        clearTimeout: timerId => timers.delete(timerId),
        Math
    });

    return {
        cells,
        elements,
        timers,
        runNextTimer() {
            const [timerId, callback] = timers.entries().next().value || [];
            if (callback) {
                timers.delete(timerId);
                callback();
            }
        }
    };
}

test('new games alternate the starter, while changing mode starts again with X', () => {
    const game = createGame();
    game.elements['player-x-name'].value = 'Ada';
    game.elements['player-x-name'].input();
    game.elements['player-o-name'].value = 'Ben';
    game.elements['player-o-name'].input();

    assert.equal(game.elements.output.textContent, 'Ada (X) ist dran.');
    game.cells[0].click();
    assert.equal(game.elements.output.textContent, 'Ben (O) ist dran.');

    game.elements.restart.click();
    assert.equal(game.elements.output.textContent, 'Ben (O) ist dran.');
    assert.equal(game.cells.every(cell => cell.textContent === ''), true);
    game.cells[0].click();
    game.elements.restart.click();
    assert.equal(game.elements.output.textContent, 'Ada (X) ist dran.');

    game.elements['game-mode'].value = 'computer';
    game.elements['game-mode'].change();
    assert.equal(game.elements.output.textContent, 'Ada (X) ist dran.');
    assert.equal(game.timers.size, 0);
});

test('the computer can start as O and human moves are blocked until its move', () => {
    const game = createGame({ mode: 'computer', difficulty: 'easy' });
    game.elements.restart.click();

    assert.equal(game.elements.output.textContent, 'Computer (O) denkt ...');
    assert.equal(game.timers.size, 1);
    game.cells[0].click();
    assert.equal(game.cells[0].textContent, '');

    game.runNextTimer();
    assert.equal(game.cells.filter(cell => cell.textContent === 'O').length, 1);
    assert.equal(game.elements.output.textContent, 'Spieler X (X) ist dran.');
    game.cells.find(cell => cell.textContent === '').click();
    assert.equal(game.elements.output.textContent, 'Computer (O) denkt ...');
    game.runNextTimer();
    assert.equal(game.cells.filter(cell => cell.textContent === 'O').length, 2);
});

test('hard computer still blocks and wins after the starting-player feature', () => {
    const game = createGame({ mode: 'computer', difficulty: 'hard' });
    const humanMove = index => {
        game.cells[index].click();
        game.runNextTimer();
    };

    humanMove(0);
    humanMove(2);
    assert.equal(game.cells[1].textContent, 'O');
    humanMove(8);
    assert.equal(game.cells[7].textContent, 'O');
    assert.equal(game.elements.output.textContent, 'Computer (O) hat gewonnen!');
});

test('restart and mode changes cancel a pending computer move', () => {
    const game = createGame({ mode: 'computer' });
    game.cells[0].click();
    assert.equal(game.timers.size, 1);

    game.elements.restart.click();
    assert.equal(game.timers.size, 1);
    game.elements['game-mode'].value = 'two-player';
    game.elements['game-mode'].change();
    assert.equal(game.timers.size, 0);
    assert.equal(game.elements.output.textContent, 'Spieler X (X) ist dran.');
    game.runNextTimer();
    assert.equal(game.cells.every(cell => cell.textContent === ''), true);
});
