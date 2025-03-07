import { fetchAllParticipantsFromXano } from "./api.js";

function maskWallet(wallet) {
  if (wallet.length <= 8) return wallet;
  return wallet.substring(0, 4) + "****" + wallet.substring(wallet.length - 4);
}

export async function showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer) {
  const records = await fetchAllParticipantsFromXano();
  let html = "<table><tr><th>BTC Wallet</th><th>Score</th></tr>";
  let currentPlayerIndex = -1;
  records.forEach((rec, index) => {
    const shortWallet = maskWallet(rec.wallet || "");
    let rowId = "";
    if (currentPlayer && rec.wallet === currentPlayer.wallet) {
      rowId = " id='currentPlayerRow'";
      currentPlayerIndex = index;
    }
    html += `<tr${rowId}>
               <td>${rec.wallet}</td>
               <td>${rec.score}</td>
             </tr>`;
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
