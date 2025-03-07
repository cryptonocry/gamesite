// Замените URL-ы на ваши реальные эндпоинты Xano
export const XANO_GET_URL  = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_get";
export const XANO_POST_URL = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_post";
// Мы будем делать PUT /gamerecords/{id}
export const XANO_PUT_URL  = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords";

export async function addParticipantToXano(wallet, score) {
  try {
    const body = { wallet, score };
    const response = await fetch(XANO_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log("Added new record to Xano:", data);
    return data;
  } catch (e) {
    console.error("Error adding record to Xano:", e);
    return null;
  }
}

export async function updateParticipantOnXano(recordId, wallet, score) {
  try {
    const url = `${XANO_PUT_URL}/${recordId}`;
    const body = { wallet, score };
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log("Updated record on Xano:", data);
    return data;
  } catch (e) {
    console.error("Error updating record on Xano:", e);
    return null;
  }
}

export async function fetchAllParticipantsFromXano() {
  try {
    const response = await fetch(XANO_GET_URL);
    const data = await response.json();
    console.log("Fetched records from Xano:", data);
    return data;
  } catch (e) {
    console.error("Error fetching records from Xano:", e);
    return [];
  }
}
