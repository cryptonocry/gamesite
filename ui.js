import { fetchAllParticipantsFromXano } from "./api.js";

export async function showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer) {
  const records = await fetchAllParticipantsFromXano();
  // Отображаем только кошелёк и счёт
  let html = "<table><tr><th>Wallet</th><th>Score</th></tr>";
  records.forEach((rec) => {
    html += `<tr>
               <td>${rec.wallet}</td>
               <td>${rec.score}</td>
             </tr>`;
  });
  html += "</table>";
  recordsTableContainer.innerHTML = html;
  recordsContainer.style.display = "block";
}
