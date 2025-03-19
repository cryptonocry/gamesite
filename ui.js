import { fetchAllParticipantsFromXano } from "./api.js";

function maskWallet(wallet) {
  if (wallet.length <= 8) return wallet;
  return wallet.substring(0, 4) + "****" + wallet.substring(wallet.length - 4);
}

export async function showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer) {
  const records = await fetchAllParticipantsFromXano();
  if (!records || records.length === 0) {
    recordsTableContainer.innerHTML = "No records found.";
    recordsContainer.style.display = "block";
    return;
  }

  // 1) Сортируем по убыванию счёта
  records.sort((a, b) => b.score - a.score);

  // 2) Заголовок таблицы: #, Wallet, Score
  let html = "<table><tr><th>#</th><th>BTC Wallet</th><th>Score</th></tr>";

  // 3) Выводим строки
  records.forEach((rec, index) => {
    // rank = index + 1
    const rank = index + 1;

    // Обрезаем кошелёк, если нужно
    const shortWallet = maskWallet(rec.wallet || "");

    // Подсветка текущего игрока
    let rowId = "";
    if (currentPlayer && rec.wallet === currentPlayer.wallet) {
      rowId = " id='currentPlayerRow'";
    }

    html += `
      <tr${rowId}>
        <td>${rank}</td>
        <td>${shortWallet}</td>
        <td>${rec.score}</td>
      </tr>
    `;
  });

  html += "</table>";
  recordsTableContainer.innerHTML = html;
  recordsContainer.style.display = "block";

  setTimeout(() => {
    const row = document.getElementById("currentPlayerRow");
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
}
