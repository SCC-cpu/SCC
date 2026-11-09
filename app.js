"use strict";

const databaseName = "elColoradoCatalogo";
const databaseVersion = 3;
const storeName = "productos";
const configStoreName = "configuracion";
const passwordIterations = 180000;
const categories = ["Fresco", "Congelado", "Embutido", "Pescado", "Pollo", "Res", "Papas", "Sin clasificar"];
const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const form = document.querySelector("#product-form");
const nameInput = document.querySelector("#name");
const categoryInput = document.querySelector("#category");
const tablePriceInput = document.querySelector("#table-price");
const boxPriceInput = document.querySelector("#box-price");
const productList = document.querySelector("#product-list");
const emptyState = document.querySelector("#empty-state");
const noResults = document.querySelector("#no-results");
const searchInput = document.querySelector("#search");
const message = document.querySelector("#message");
const editButton = document.querySelector("#edit-button");
const deleteButton = document.querySelector("#delete-button");
const cancelButton = document.querySelector("#cancel-button");
const saveButton = document.querySelector("#save-button");
const formTitle = document.querySelector("#form-title");
const selectedName = document.querySelector("#selected-name");
const selectedTablePrice = document.querySelector("#selected-table-price");
const selectedBoxPrice = document.querySelector("#selected-box-price");
const productCount = document.querySelector("#product-count");
const adminPanel = document.querySelector("#admin-panel");
const detailPanel = document.querySelector(".detail-panel");
const roleLabel = document.querySelector("#role-label");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const loginDialog = document.querySelector("#login-dialog");
const loginForm = document.querySelector("#login-form");
const loginRole = document.querySelector("#login-role");
const loginUsername = document.querySelector("#login-username");
const loginPassword = document.querySelector("#login-password");
const authError = document.querySelector("#auth-error");
const loginSubmitButton = document.querySelector("#login-submit-button");
const cancelLoginButton = document.querySelector("#cancel-login-button");
const bootstrapDialog = document.querySelector("#bootstrap-dialog");
const bootstrapCredentials = document.querySelector("#bootstrap-credentials");
const bootstrapContinueButton = document.querySelector("#bootstrap-continue-button");
const passwordDialog = document.querySelector("#password-dialog");
const passwordForm = document.querySelector("#password-form");
const newPasswordInput = document.querySelector("#new-password");
const confirmNewPasswordInput = document.querySelector("#confirm-new-password");
const passwordError = document.querySelector("#password-error");
const passwordSubmitButton = document.querySelector("#password-submit-button");
const startupError = document.querySelector("#startup-error");
const main = document.querySelector("main");

let database;
let products = [];
let selectedId = null;
let editingId = null;
let currentRole = null;
let adminAccount = null;
let clientAccount = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este navegador no permite guardar productos localmente."));
      return;
    }

    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(configStoreName)) {
        db.createObjectStore(configStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir la base de datos."));
    request.onblocked = () => reject(new Error("Cierra otras pestañas del catálogo e inténtalo de nuevo."));
  });
}

function getConfig(id) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(configStoreName, "readonly").objectStore(configStoreName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("No se pudo consultar la configuración."));
  });
}

function saveConfig(value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(configStoreName, "readwrite");
    transaction.objectStore(configStoreName).put(value);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar la configuración."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado de la configuración."));
  });
}

function readProducts() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudieron leer los productos."));
  });
}

function writeProduct(product, id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = id === undefined ? store.add(product) : store.put({ ...product, id });
    let savedId = id;
    request.onsuccess = () => {
      if (id === undefined) savedId = request.result;
    };
    transaction.oncomplete = () => resolve(savedId);
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el producto."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del producto."));
  });
}

function removeProduct(id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el producto."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló la eliminación del producto."));
  });
}

async function derivePasswordHash(password, salt, iterations = passwordIterations) {
  if (!crypto.subtle) {
    throw new Error("Este navegador no permite proteger contraseñas. Abre el catálogo desde localhost o HTTPS.");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return Array.from(new Uint8Array(bits));
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function hashesMatch(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index];
  }
  return difference === 0;
}

function makeTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const randomValues = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

async function makeAccount(id, username, password, mustChangePassword) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt);
  return {
    id,
    username,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: passwordIterations,
    mustChangePassword,
  };
}

async function createInitialAccounts() {
  let administrator = await getConfig("account-admin");
  let client = await getConfig("account-client");
  const generatedCredentials = [];

  if (!administrator) {
    const previousCredential = await getConfig("adminPassword");
    if (previousCredential) {
      administrator = {
        id: "account-admin",
        username: "admin",
        salt: previousCredential.salt,
        hash: previousCredential.hash,
        iterations: previousCredential.iterations || passwordIterations,
        mustChangePassword: true,
      };
      await saveConfig(administrator);
      generatedCredentials.push({ username: "admin", password: null, legacy: true });
    } else {
      const password = makeTemporaryPassword();
      administrator = await makeAccount("account-admin", "admin", password, true);
      await saveConfig(administrator);
      generatedCredentials.push({ username: "admin", password });
    }
  }

  if (!client) {
    const password = makeTemporaryPassword();
    client = await makeAccount("account-client", "cliente", password, false);
    await saveConfig(client);
    generatedCredentials.push({ username: "cliente", password });
  }

  adminAccount = administrator;
  clientAccount = client;
  if (generatedCredentials.length > 0) showInitialCredentials(generatedCredentials);
}

function showInitialCredentials(credentials) {
  bootstrapCredentials.replaceChildren();
  for (const credential of credentials) {
    const item = document.createElement("p");
    item.className = "credential-item";
    const accountType = credential.username === "admin" ? "Administrador" : "Cliente";
    item.append(`${accountType} — usuario: ${credential.username}`);
    if (credential.password) {
      item.append(document.createElement("br"), `Contraseña temporal: ${credential.password}`);
    } else {
      item.append(document.createElement("br"), "Usa la contraseña de administrador que ya tenías; se te pedirá cambiarla.");
    }
    bootstrapCredentials.append(item);
  }
  bootstrapDialog.showModal();
}

function setAuthenticatedView(role) {
  currentRole = role;
  main.hidden = role === null;
  document.body.classList.toggle("admin-mode", role === "admin");
  document.body.classList.toggle("client-mode", role === "client");
  roleLabel.textContent = role === "admin" ? "Administrador" : role === "client" ? "Cliente" : "Sin sesión";
  loginButton.hidden = role !== null;
  logoutButton.hidden = role === null;
  adminPanel.hidden = role !== "admin";
  detailPanel.hidden = role !== "admin";
  render();
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function makeCell(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function selectProduct(id) {
  selectedId = id;
  render();
}

function sortProducts(first, second) {
  const firstCategory = categories.indexOf(first.category || "Sin clasificar");
  const secondCategory = categories.indexOf(second.category || "Sin clasificar");
  return firstCategory - secondCategory ||
    first.name.localeCompare(second.name, "es-MX", { sensitivity: "base" });
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase("es-MX");
  const visibleProducts = products
    .filter((product) =>
      `${product.name} ${product.category || "Sin clasificar"}`.toLocaleLowerCase("es-MX").includes(query)
    )
    .sort(sortProducts);
  productList.replaceChildren();
  let currentCategory = null;

  for (const product of visibleProducts) {
    const category = product.category || "Sin clasificar";
    if (category !== currentCategory) {
      const categoryRow = document.createElement("tr");
      categoryRow.className = "category-row";
      const categoryCell = document.createElement("th");
      categoryCell.scope = "rowgroup";
      categoryCell.colSpan = 3;
      categoryCell.textContent = category;
      categoryRow.append(categoryCell);
      productList.append(categoryRow);
      currentCategory = category;
    }

    const row = document.createElement("tr");
    if (currentRole === "admin") {
      row.tabIndex = 0;
      row.setAttribute("aria-selected", String(product.id === selectedId));
      if (product.id === selectedId) row.classList.add("selected");
      row.addEventListener("click", () => selectProduct(product.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectProduct(product.id);
        }
      });
    }
    row.append(
      makeCell(product.name, "product-name-cell"),
      makeCell(currency.format(product.tablePrice), "price-cell"),
      makeCell(currency.format(product.boxPrice), "price-cell")
    );
    productList.append(row);
  }

  emptyState.hidden = products.length > 0;
  noResults.hidden = products.length === 0 || visibleProducts.length > 0;
  productCount.textContent = String(products.length);
  const selectedProduct = products.find((product) => product.id === selectedId);
  if (selectedProduct) {
    selectedName.textContent = selectedProduct.name;
    selectedTablePrice.textContent = currency.format(selectedProduct.tablePrice);
    selectedBoxPrice.textContent = currency.format(selectedProduct.boxPrice);
  } else {
    selectedName.textContent = "Selecciona un producto";
    selectedTablePrice.textContent = "—";
    selectedBoxPrice.textContent = "—";
  }
  editButton.disabled = currentRole !== "admin" || !selectedProduct;
  deleteButton.disabled = currentRole !== "admin" || !selectedProduct;
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = "Agregar producto";
  saveButton.textContent = "Guardar producto";
  cancelButton.hidden = true;
}

function refreshProducts() {
  return readProducts().then((items) => {
    products = items;
    if (!products.some((product) => product.id === selectedId)) {
      selectedId = products[0]?.id ?? null;
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentRole !== "admin" || !form.reportValidity()) return;

  const name = nameInput.value.trim();
  const category = categoryInput.value;
  const tablePrice = Number(tablePriceInput.value);
  const boxPrice = Number(boxPriceInput.value);
  if (!name || !categories.includes(category) || category === "Sin clasificar" ||
      !Number.isFinite(tablePrice) || !Number.isFinite(boxPrice) || tablePrice < 0 || boxPrice < 0) {
    showMessage("Escribe un nombre, tipo y precios válidos, iguales o mayores a cero.", true);
    return;
  }

  saveButton.disabled = true;
  showMessage("");
  const wasEditing = editingId !== null;
  try {
    const id = await writeProduct({ name, category, tablePrice, boxPrice }, editingId === null ? undefined : editingId);
    await refreshProducts();
    selectedId = id;
    resetForm();
    render();
    showMessage(wasEditing ? "Producto actualizado correctamente." : "Producto guardado correctamente.");
  } catch (error) {
    showMessage(error.message || "Ocurrió un error al guardar el producto.", true);
  } finally {
    saveButton.disabled = false;
  }
});

editButton.addEventListener("click", () => {
  if (currentRole !== "admin") return;
  const product = products.find((item) => item.id === selectedId);
  if (!product) return;
  editingId = product.id;
  nameInput.value = product.name;
  categoryInput.value = product.category || "";
  tablePriceInput.value = String(product.tablePrice);
  boxPriceInput.value = String(product.boxPrice);
  formTitle.textContent = "Editar producto";
  saveButton.textContent = "Guardar cambios";
  cancelButton.hidden = false;
  showMessage("");
  nameInput.focus();
});

deleteButton.addEventListener("click", async () => {
  if (currentRole !== "admin") return;
  const product = products.find((item) => item.id === selectedId);
  if (!product || !window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;

  deleteButton.disabled = true;
  try {
    await removeProduct(product.id);
    await refreshProducts();
    selectedId = products[0]?.id ?? null;
    if (editingId === product.id) resetForm();
    render();
    showMessage("Producto eliminado.");
  } catch (error) {
    showMessage(error.message || "Ocurrió un error al eliminar el producto.", true);
  } finally {
    deleteButton.disabled = !products.some((item) => item.id === selectedId);
  }
});

cancelButton.addEventListener("click", () => {
  resetForm();
  showMessage("");
});
searchInput.addEventListener("input", render);

function openLoginDialog() {
  authError.textContent = "";
  loginForm.reset();
  loginUsername.value = loginRole.value === "admin" ? "admin" : "cliente";
  loginDialog.showModal();
  loginUsername.focus();
}

loginButton.addEventListener("click", openLoginDialog);
loginRole.addEventListener("change", () => {
  loginUsername.value = loginRole.value === "admin" ? "admin" : "cliente";
});
cancelLoginButton.addEventListener("click", () => loginDialog.close());
bootstrapContinueButton.addEventListener("click", () => {
  bootstrapDialog.close();
  openLoginDialog();
});
bootstrapDialog.addEventListener("cancel", (event) => event.preventDefault());

logoutButton.addEventListener("click", () => {
  if (editingId !== null) resetForm();
  showMessage("");
  setAuthenticatedView(null);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  loginSubmitButton.disabled = true;
  try {
    const account = loginRole.value === "admin" ? adminAccount : clientAccount;
    const password = loginPassword.value;
    const hash = await derivePasswordHash(password, base64ToBytes(account.salt), account.iterations);
    if (loginUsername.value.trim() !== account.username ||
        !hashesMatch(hash, Array.from(base64ToBytes(account.hash)))) {
      authError.textContent = "El usuario o la contraseña son incorrectos.";
      loginPassword.select();
      return;
    }

    loginDialog.close();
    if (loginRole.value === "admin" && account.mustChangePassword) {
      passwordError.textContent = "";
      passwordForm.reset();
      passwordDialog.showModal();
      newPasswordInput.focus();
      return;
    }
    setAuthenticatedView(loginRole.value);
    showMessage(loginRole.value === "admin" ? "Sesión de administrador iniciada." : "Sesión de cliente iniciada.");
  } catch (error) {
    authError.textContent = error.message || "No se pudo validar el acceso.";
  } finally {
    loginSubmitButton.disabled = false;
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passwordError.textContent = "";
  const password = newPasswordInput.value;
  if (password.length < 8) {
    passwordError.textContent = "La contraseña debe tener al menos 8 caracteres.";
    return;
  }
  if (password !== confirmNewPasswordInput.value) {
    passwordError.textContent = "Las contraseñas no coinciden.";
    return;
  }

  passwordSubmitButton.disabled = true;
  try {
    adminAccount = await makeAccount("account-admin", adminAccount.username, password, false);
    await saveConfig(adminAccount);
    passwordDialog.close();
    setAuthenticatedView("admin");
    showMessage("Contraseña actualizada. Ya puedes administrar el catálogo.");
  } catch (error) {
    passwordError.textContent = error.message || "No se pudo cambiar la contraseña.";
  } finally {
    passwordSubmitButton.disabled = false;
  }
});

async function initialize() {
  try {
    database = await openDatabase();
    database.onversionchange = () => database.close();
    await createInitialAccounts();
    await refreshProducts();
    setAuthenticatedView(null);
    if (!bootstrapDialog.open) loginButton.focus();
  } catch (error) {
    startupError.textContent = error.message || "No se pudo iniciar el catálogo.";
    startupError.hidden = false;
    loginButton.disabled = true;
  }
}

initialize();
