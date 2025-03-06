export const XANO_GET_URL  = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_get";
export const XANO_POST_URL = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_post";

export async function addParticipantToXano(nickname, wallet, score) {
  try {
    const body = { nickname, wallet, score };
    const response = await fetch(XANO_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log("Добавлен результат в Xano:", data);
    return data;
  } catch (e) {
    console.error("Ошибка при отправке данных в Xano:", e);
  }
}

export async function fetchAllParticipantsFromXano() {
  try {
    const response = await fetch(XANO_GET_URL);
    const data = await response.json();
    console.log("Список из Xano:", data);
    return data;
  } catch (e) {
    console.error("Ошибка при получении данных из Xano:", e);
    return [];
  }
}
