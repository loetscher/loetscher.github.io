document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const cells = Array.from(document.querySelectorAll('[data-cell]'));
    const restartButton = document.getElementById('restart');
    const modeSelect = document.getElementById('game-mode');
    const difficultySelect = document.getElementById('difficulty');
    const difficultySetting = document.getElementById('difficulty-setting');
    const nameInputs = {
        X: document.getElementById('player-x-name'),
        O: document.getElementById('player-o-name')
    };
    const winningLines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    let board = Array(9).fill(null);
    let currentPlayer = 'X';
    let nextStartingPlayer = 'X';
    let gameOver = false;
    let gameResult = null;
    let computerThinking = false;
    let computerTimer = null;

    const nameStorageKeys = {
        X: 'tic-tac-toe-name-x',
        O: 'tic-tac-toe-name-o'
    };

    function loadSavedNames() {
        try {
            Object.entries(nameStorageKeys).forEach(([mark, key]) => {
                const savedName = localStorage.getItem(key);
                if (savedName !== null) {
                    nameInputs[mark].value = savedName;
                }
            });
        } catch (error) {
            // Speicher nicht verfügbar (z. B. privater Modus) – Namen bleiben nur für diese Sitzung.
        }
    }

    function saveName(mark) {
        try {
            const name = nameInputs[mark].value.trim();
            if (name) {
                localStorage.setItem(nameStorageKeys[mark], name);
            } else {
                localStorage.removeItem(nameStorageKeys[mark]);
            }
        } catch (error) {
            // Speicher nicht verfügbar – Name wird nicht dauerhaft gespeichert.
        }
    }

    function isComputerGame() {
        return modeSelect.value === 'computer';
    }

    function playerName(mark) {
        if (mark === 'O' && isComputerGame()) {
            return 'Computer';
        }

        const name = nameInputs[mark].value.trim();
        return name || `Spieler ${mark}`;
    }

    function renderStatus() {
        if (gameResult === 'draw') {
            output.textContent = 'Unentschieden!';
        } else if (gameResult) {
            output.textContent = `${playerName(gameResult)} (${gameResult}) hat gewonnen!`;
        } else if (computerThinking) {
            output.textContent = 'Computer (O) denkt ...';
        } else {
            output.textContent = `${playerName(currentPlayer)} (${currentPlayer}) ist dran.`;
        }
    }

    function findWinningLine(positionBoard, mark) {
        return winningLines.find(line => line.every(position => positionBoard[position] === mark));
    }

    function minimax(positionBoard, mark, depth) {
        if (findWinningLine(positionBoard, 'O')) {
            return 10 - depth;
        }
        if (findWinningLine(positionBoard, 'X')) {
            return depth - 10;
        }
        if (positionBoard.every(Boolean)) {
            return 0;
        }

        const scores = [];
        positionBoard.forEach((value, index) => {
            if (value !== null) {
                return;
            }

            positionBoard[index] = mark;
            scores.push(minimax(positionBoard, mark === 'O' ? 'X' : 'O', depth + 1));
            positionBoard[index] = null;
        });

        return mark === 'O' ? Math.max(...scores) : Math.min(...scores);
    }

    function chooseComputerMove() {
        const availableMoves = board
            .map((value, index) => value === null ? index : null)
            .filter(index => index !== null);

        if (difficultySelect.value === 'easy') {
            return availableMoves[Math.floor(Math.random() * availableMoves.length)];
        }

        let bestMove = availableMoves[0];
        let bestScore = -Infinity;
        availableMoves.forEach(index => {
            board[index] = 'O';
            const score = minimax(board, 'X', 1);
            board[index] = null;
            if (score > bestScore) {
                bestScore = score;
                bestMove = index;
            }
        });
        return bestMove;
    }

    function scheduleComputerMove() {
        computerThinking = true;
        renderStatus();
        computerTimer = setTimeout(() => {
            computerTimer = null;
            if (!computerThinking || gameOver || !isComputerGame()) {
                return;
            }

            const computerMove = chooseComputerMove();
            computerThinking = false;
            makeMove(computerMove);
        }, 450);
    }

    function makeMove(index) {
        if (gameOver || board[index] !== null) {
            return;
        }

        board[index] = currentPlayer;
        cells[index].textContent = currentPlayer;
        cells[index].dataset.mark = currentPlayer;
        cells[index].setAttribute('aria-label', `Feld ${index + 1}, ${currentPlayer}`);

        const winningLine = findWinningLine(board, currentPlayer);
        if (winningLine) {
            gameOver = true;
            gameResult = currentPlayer;
            winningLine.forEach(position => cells[position].classList.add('winner'));
            renderStatus();
            return;
        }

        if (board.every(Boolean)) {
            gameOver = true;
            gameResult = 'draw';
            renderStatus();
            return;
        }

        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        if (isComputerGame() && currentPlayer === 'O') {
            scheduleComputerMove();
            return;
        }

        renderStatus();
    }

    function playTurn(event) {
        const index = Number(event.currentTarget.dataset.cell);
        if (computerThinking || (isComputerGame() && currentPlayer !== 'X')) {
            return;
        }
        makeMove(index);
    }

    function startNewGame(startingPlayer = nextStartingPlayer) {
        if (computerTimer !== null) {
            clearTimeout(computerTimer);
            computerTimer = null;
        }

        board = Array(9).fill(null);
        currentPlayer = startingPlayer;
        nextStartingPlayer = startingPlayer === 'X' ? 'O' : 'X';
        gameOver = false;
        gameResult = null;
        computerThinking = false;
        difficultySetting.hidden = !isComputerGame();
        nameInputs.O.disabled = isComputerGame();

        cells.forEach((cell, index) => {
            cell.textContent = '';
            cell.removeAttribute('data-mark');
            cell.classList.remove('winner');
            cell.setAttribute('aria-label', `Feld ${index + 1}, leer`);
        });

        renderStatus();
        if (isComputerGame() && currentPlayer === 'O') {
            scheduleComputerMove();
        }
    }

    cells.forEach(cell => cell.addEventListener('click', playTurn));
    Object.entries(nameInputs).forEach(([mark, input]) => input.addEventListener('input', () => {
        saveName(mark);
        renderStatus();
    }));
    restartButton.addEventListener('click', () => startNewGame());
    modeSelect.addEventListener('change', () => startNewGame('X'));
    loadSavedNames();
    startNewGame('X');
});
