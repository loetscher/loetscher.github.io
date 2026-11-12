document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const cells = Array.from(document.querySelectorAll('[data-cell]'));
    const restartButton = document.getElementById('restart');
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
    let gameOver = false;
    let gameResult = null;

    function playerName(mark) {
        const name = nameInputs[mark].value.trim();
        return name || `Spieler ${mark}`;
    }

    function renderStatus() {
        if (gameResult === 'draw') {
            output.textContent = 'Unentschieden!';
        } else if (gameResult) {
            output.textContent = `${playerName(gameResult)} (${gameResult}) hat gewonnen!`;
        } else {
            output.textContent = `${playerName(currentPlayer)} (${currentPlayer}) ist dran.`;
        }
    }

    function playTurn(event) {
        const cell = event.currentTarget;
        const index = Number(cell.dataset.cell);

        if (gameOver || board[index] !== null) {
            return;
        }

        board[index] = currentPlayer;
        cell.textContent = currentPlayer;
        cell.dataset.mark = currentPlayer;
        cell.setAttribute('aria-label', `Feld ${index + 1}, ${currentPlayer}`);

        const winningLine = winningLines.find(line => line.every(position => board[position] === currentPlayer));
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
        renderStatus();
    }

    function startNewGame() {
        board = Array(9).fill(null);
        currentPlayer = 'X';
        gameOver = false;
        gameResult = null;

        cells.forEach((cell, index) => {
            cell.textContent = '';
            cell.removeAttribute('data-mark');
            cell.classList.remove('winner');
            cell.setAttribute('aria-label', `Feld ${index + 1}, leer`);
        });

        renderStatus();
    }

    cells.forEach(cell => cell.addEventListener('click', playTurn));
    Object.values(nameInputs).forEach(input => input.addEventListener('input', renderStatus));
    restartButton.addEventListener('click', startNewGame);
    startNewGame();
});
