async function loadUsers() {
  const response = await fetch("/api/users");
  return response.json();
}

async function loadUserStatus(id) {
  const response = await fetch(`/api/users/${id}/status?include=activity`);
  return response.json();
}

async function updateBilling(payload) {
  const response = await fetch("/api/billing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

const axios = window.axios;
const api = axios.create({ baseURL: "/api" });

async function loadProjects() {
  return api.get("/projects/");
}

async function loadReports() {
  return axios.get("/api/reports");
}

loadUsers();
loadUserStatus(1);
updateBilling({ plan: "pro" });
loadProjects();
loadReports();
