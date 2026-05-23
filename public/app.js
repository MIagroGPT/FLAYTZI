// ==========================================================================
// FLYTZI - CONTROLADOR FRONTEND (LÓGICA HÍBRIDA & INTERFAZ DINÁMICA)
// ==========================================================================

// 1. ESTADO GLOBAL DE LA APLICACIÓN
let searchState = {
  tripType: 'roundtrip', // 'roundtrip' o 'oneway'
  originCode: '',
  originName: '',
  destCode: '',
  destName: '',
  flights: [],
  filteredFlights: [],
  currentSlide: 0,
  autoSlideInterval: null
};

// 2. CONFIGURACIÓN INICIAL AL CARGAR LA PÁGINA
document.addEventListener('DOMContentLoaded', () => {
  setupDateLimits();
  setupAutocomplete('origin-input', 'origin-dropdown', 'clear-origin', 'origin-code');
  setupAutocomplete('dest-input', 'dest-dropdown', 'clear-dest', 'dest-code');
  startAutoSlide();
  
  // Ocultar dropdowns si se hace clic fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-group')) {
      document.querySelectorAll('.autocomplete-dropdown').forEach(d => d.style.display = 'none');
    }
  });
});

// Configura las restricciones de fechas (no fechas pasadas)
function setupDateLimits() {
  const today = new Date().toISOString().split('T')[0];
  const depInput = document.getElementById('departure-date');
  const retInput = document.getElementById('return-date');
  
  depInput.min = today;
  retInput.min = today;

  depInput.addEventListener('change', () => {
    retInput.min = depInput.value;
    if (retInput.value && retInput.value < depInput.value) {
      retInput.value = depInput.value;
    }
  });
}

// Alternar entre Ida/Vuelta y Solo Ida
function setTripType(type) {
  searchState.tripType = type;
  
  const tabRound = document.getElementById('tab-roundtrip');
  const tabOne = document.getElementById('tab-oneway');
  const returnGroup = document.getElementById('return-date-group');
  const returnInput = document.getElementById('return-date');

  if (type === 'roundtrip') {
    tabRound.classList.add('active');
    tabOne.classList.remove('active');
    returnGroup.style.display = 'flex';
    returnInput.required = true;
  } else {
    tabRound.classList.remove('active');
    tabOne.classList.add('active');
    returnGroup.style.display = 'none';
    returnInput.required = false;
    returnInput.value = '';
  }
}

// 3. LÓGICA DE AUTOCOMPLETADO INTELIGENTE (IATA)
function setupAutocomplete(inputId, dropdownId, clearBtnId, hiddenCodeId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const clearBtn = document.getElementById(clearBtnId);
  const hiddenCode = document.getElementById(hiddenCodeId);
  
  let debounceTimer;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearBtn.style.display = query.length > 0 ? 'block' : 'none';
    
    if (query.length < 2) {
      dropdown.style.display = 'none';
      hiddenCode.value = '';
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetch(`/api/airports?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          renderDropdown(data, dropdown, input, hiddenCode, clearBtn);
        })
        .catch(err => console.error("Error al buscar aeropuertos:", err));
    }, 150);
  });

  // Botón para borrar campo
  clearBtn.addEventListener('click', () => {
    input.value = '';
    hiddenCode.value = '';
    clearBtn.style.display = 'none';
    dropdown.style.display = 'none';
    input.focus();
  });
}

function renderDropdown(airportsList, dropdown, input, hiddenCode, clearBtn) {
  dropdown.innerHTML = '';
  
  if (airportsList.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  airportsList.forEach(airport => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.innerHTML = `
      <div class="autocomplete-info">
        <span class="autocomplete-city">${airport.city}, ${airport.country}</span>
        <span class="autocomplete-airport">${airport.name}</span>
      </div>
      <span class="autocomplete-code">${airport.code}</span>
    `;

    item.addEventListener('click', () => {
      input.value = `${airport.city} (${airport.code})`;
      hiddenCode.value = airport.code;
      
      // Guardar nombre en estado para el mensaje de WhatsApp
      if (input.id === 'origin-input') {
        searchState.originName = `${airport.city} (${airport.code})`;
      } else {
        searchState.destName = `${airport.city} (${airport.code})`;
      }

      dropdown.style.display = 'none';
      clearBtn.style.display = 'block';
    });

    dropdown.appendChild(item);
  });

  dropdown.style.display = 'block';
}

// Intercambiar Origen y Destino
function swapLocations() {
  const originInput = document.getElementById('origin-input');
  const destInput = document.getElementById('dest-input');
  const originCode = document.getElementById('origin-code');
  const destCode = document.getElementById('dest-code');
  const clearOrigin = document.getElementById('clear-origin');
  const clearDest = document.getElementById('clear-dest');

  // Guardar temporales
  const tempVal = originInput.value;
  const tempCode = originCode.value;
  const tempName = searchState.originName;

  // Intercambiar valores visuales e internos
  originInput.value = destInput.value;
  originCode.value = destCode.value;
  searchState.originName = searchState.destName;

  destInput.value = tempVal;
  destCode.value = tempCode;
  searchState.destName = tempName;

  // Actualizar visibilidad de botones de borrado
  clearOrigin.style.display = originInput.value ? 'block' : 'none';
  clearDest.style.display = destInput.value ? 'block' : 'none';
}

// 4. FLUJO DE BÚSQUEDA Y COMUNICACIÓN API
function handleSearch(event) {
  event.preventDefault();

  const origin = document.getElementById('origin-code').value;
  const destination = document.getElementById('dest-code').value;
  const departureDate = document.getElementById('departure-date').value;
  const returnDate = document.getElementById('return-date').value;
  const passengers = document.getElementById('passengers-select').value;
  const cabinClass = document.getElementById('class-select').value;

  // Validación de seguridad para obligar uso de autocompletado
  if (!origin) {
    alert("Por favor selecciona un aeropuerto de origen válido de la lista desplegable.");
    document.getElementById('origin-input').focus();
    return;
  }
  if (!destination) {
    alert("Por favor selecciona un aeropuerto de destino válido de la lista desplegable.");
    document.getElementById('dest-input').focus();
    return;
  }
  if (origin === destination) {
    alert("El origen y el destino no pueden ser el mismo aeropuerto.");
    return;
  }

  // Activar interfaz de resultados y loader
  const resultsSec = document.getElementById('results-section');
  const loader = document.getElementById('results-loader');
  const emptyState = document.getElementById('results-empty');
  const listContainer = document.getElementById('flights-list');
  const resultsCount = document.getElementById('results-count');

  resultsSec.style.display = 'block';
  loader.style.display = 'block';
  emptyState.style.display = 'none';
  listContainer.innerHTML = '';
  resultsCount.textContent = 'Buscando tarifas...';

  // Desplazamiento suave hacia la sección de resultados
  resultsSec.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Construir consulta url
  let url = `/api/flights?origin=${origin}&destination=${destination}&departureDate=${departureDate}&passengers=${passengers}&cabinClass=${cabinClass}`;
  if (searchState.tripType === 'roundtrip' && returnDate) {
    url += `&returnDate=${returnDate}`;
  }

  // Hacer llamada al backend
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Respuesta inválida del servidor');
      return res.json();
    })
    .then(data => {
      searchState.flights = data;
      searchState.filteredFlights = [...data];
      
      // Simular un retardo suave de carga de 1.2 segundos para aumentar la sensación de cálculo analítico de confianza
      setTimeout(() => {
        loader.style.display = 'none';
        
        if (data.length === 0) {
          emptyState.style.display = 'block';
          resultsCount.textContent = '0 tarifas privadas encontradas';
        } else {
          renderFlightCards(data);
          resultsCount.textContent = `${data.length} tarifas privadas optimizadas encontradas`;
        }
      }, 1200);
    })
    .catch(err => {
      console.error("Error en búsqueda:", err);
      setTimeout(() => {
        loader.style.display = 'none';
        emptyState.style.display = 'block';
        resultsCount.textContent = 'Error al consultar tarifas';
      }, 1200);
    });
}

// 5. RENDERIZADO DE TARJETAS DE VUELO CON CALCULADORA FLYTZI
function renderFlightCards(flights) {
  const container = document.getElementById('flights-list');
  container.innerHTML = '';

  flights.forEach(flight => {
    const card = document.createElement('div');
    card.className = 'flight-card';
    
    // Formatear precios en USD
    const officialPriceFormatted = formatCurrency(flight.pricing.officialPrice);
    const flytziPriceFormatted = formatCurrency(flight.pricing.flytziPrice);
    const savingFormatted = formatCurrency(flight.pricing.saving);

    // Contenido del vuelo de ida
    let outboundHTML = `
      <div class="itinerary-row ${flight.returnFlight ? '' : 'no-border'}">
        <div class="airline-info">
          <div class="airline-logo-badge ${flight.logo}">${flight.logo}</div>
          <div class="airline-details">
            <span class="airline-name">${flight.airline}</span>
            <span class="flight-code">${flight.flightNumber} • Ida</span>
          </div>
        </div>
        <div class="flight-timeline">
          <div class="time-block">
            <span class="time-val">${flight.depTime}</span>
            <span class="iata-code">${flight.origin} (${flight.originCity})</span>
          </div>
          <div class="duration-block">
            <span class="duration-val">${flight.duration}</span>
            <div class="timeline-line-visual">
              <i class="fa-solid fa-plane timeline-plane"></i>
            </div>
            <span class="stops-val ${flight.stops === 0 ? 'direct' : 'stop'}">
              ${flight.stops === 0 ? 'Directo' : flight.stopDetails}
            </span>
          </div>
          <div class="time-block text-right">
            <span class="time-val">${flight.arrTime}</span>
            <span class="iata-code">${flight.destination} (${flight.destinationCity})</span>
          </div>
        </div>
      </div>
    `;

    // Contenido del vuelo de regreso si existe
    let inboundHTML = '';
    if (flight.returnFlight) {
      const ret = flight.returnFlight;
      inboundHTML = `
        <div class="itinerary-row no-border">
          <div class="airline-info">
            <div class="airline-logo-badge ${flight.logo}">${flight.logo}</div>
            <div class="airline-details">
              <span class="airline-name">${flight.airline}</span>
              <span class="flight-code">${ret.flightNumber} • Regreso</span>
            </div>
          </div>
          <div class="flight-timeline">
            <div class="time-block">
              <span class="time-val">${ret.depTime}</span>
              <span class="iata-code">${ret.origin} (${ret.originCity})</span>
            </div>
            <div class="duration-block">
              <span class="duration-val">${ret.duration}</span>
              <div class="timeline-line-visual">
                <i class="fa-solid fa-plane timeline-plane" style="transform: translate(-50%, -50%) rotate(270deg);"></i>
              </div>
              <span class="stops-val ${ret.stops === 0 ? 'direct' : 'stop'}">
                ${ret.stops === 0 ? 'Directo' : ret.stopDetails}
              </span>
            </div>
            <div class="time-block text-right">
              <span class="time-val">${ret.arrTime}</span>
              <span class="iata-code">${ret.destination} (${ret.destinationCity})</span>
            </div>
          </div>
        </div>
      `;
    }

    // Armar tarjeta completa
    card.innerHTML = `
      <div class="flight-main-info">
        ${outboundHTML}
        ${inboundHTML}
      </div>
      
      <!-- LÓGICA DEL CALCULADOR Y CTA -->
      <div class="flight-price-actions">
        <div class="flight-badge-row">
          <span class="flight-badge-pill badge-cabin"><i class="fa-solid fa-crown"></i> Clase ${flight.cabinClass}</span>
          <span class="flight-badge-pill badge-passengers"><i class="fa-solid fa-user"></i> ${flight.passengers} Pasajero(s)</span>
          <span class="flight-badge-pill badge-saving-tag"><i class="fa-solid fa-tags"></i> Ahorro Neto: ${savingFormatted}</span>
        </div>

        <!-- AGREGAR EQUIPAJE DINÁMICO CON TARIFAS CORPORATIVAS OPTIMIZADAS -->
        <div class="baggage-selector-block" style="margin: 12px 0; padding: 10px; background: rgba(16, 185, 129, 0.05); border-radius: var(--border-radius); border: 1px dashed rgba(16, 185, 129, 0.2);">
          <span class="baggage-title" style="font-size: 13px; font-weight: 700; color: var(--text-dark); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <i class="fa-solid fa-suitcase"></i> Agregar Equipaje (Optimizado Flytzi)
          </span>
          <div class="baggage-options" style="display: flex; flex-wrap: wrap; gap: 12px;">
            <label class="baggage-option" style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-dark); cursor: pointer;">
              <input type="checkbox" onchange="toggleBaggage(this, '${flight.flightId}', 'carryOn')" style="width: 16px; height: 16px; accent-color: var(--primary);">
              <span>Mano (+${formatCurrency(flight.pricing.carryOnPriceFlytzi)} USD <span style="text-decoration: line-through; color: var(--text-muted); font-size: 10px;">reg: ${formatCurrency(flight.pricing.carryOnPriceOfficial)}</span>)</span>
            </label>
            <label class="baggage-option" style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-dark); cursor: pointer;">
              <input type="checkbox" onchange="toggleBaggage(this, '${flight.flightId}', 'checked')" style="width: 16px; height: 16px; accent-color: var(--primary);">
              <span>Documentado (+${formatCurrency(flight.pricing.checkedPriceFlytzi)} USD <span style="text-decoration: line-through; color: var(--text-muted); font-size: 10px;">reg: ${formatCurrency(flight.pricing.checkedPriceOfficial)}</span>)</span>
            </label>
          </div>
        </div>
        
        <div class="prices-display">
          <span class="market-price-crossed">Mercado regular: ${officialPriceFormatted} USD</span>
          <span class="flytzi-price-highlight">
            ${flytziPriceFormatted} <span class="price-sub-label">USD (Tarifa Privada)</span>
          </span>
          <span class="badge-discount-info" style="margin-top: 4px; align-self: flex-start;">
            <i class="fa-solid fa-percent"></i> Ahorras ${flight.pricing.discountPercent}%
          </span>
        </div>
        
        <div>
          <button class="btn btn-primary btn-book" onclick="triggerWhatsAppBooking('${flight.flightId}')">
            Confirma tu reserva
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Formateador de moneda USD
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

// 6. FILTRADO Y ORDENACIÓN DE RESULTADOS
function filterResults(filterType) {
  // Manejar estado visual de los botones de filtro
  const filterBtns = document.querySelectorAll('.results-filters .filter-btn');
  filterBtns.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (filterType === 'all') {
    searchState.filteredFlights = [...searchState.flights];
  } else if (filterType === 'direct') {
    searchState.filteredFlights = searchState.flights.filter(f => f.stops === 0);
  } else if (filterType === 'cheapest') {
    // Ordenar de menor a mayor precio optimizado
    searchState.filteredFlights = [...searchState.flights].sort((a, b) => a.pricing.flytziPrice - b.pricing.flytziPrice);
  }

  renderFlightCards(searchState.filteredFlights);
}

// Variable global para registrar equipaje seleccionado en cada vuelo cotizado
const selectedBaggage = {};

function toggleBaggage(checkbox, flightId, type) {
  if (!selectedBaggage[flightId]) {
    selectedBaggage[flightId] = { carryOn: false, checked: false };
  }
  selectedBaggage[flightId][type] = checkbox.checked;

  // Encontrar el vuelo original
  const flight = searchState.flights.find(f => f.flightId === flightId);
  if (!flight) return;

  // Calcular nuevos totales agregando los costos adicionales de equipaje
  let extraOfficial = 0;
  let extraFlytzi = 0;

  if (selectedBaggage[flightId].carryOn) {
    extraOfficial += flight.pricing.carryOnPriceOfficial;
    extraFlytzi += flight.pricing.carryOnPriceFlytzi;
  }
  if (selectedBaggage[flightId].checked) {
    extraOfficial += flight.pricing.checkedPriceOfficial;
    extraFlytzi += flight.pricing.checkedPriceFlytzi;
  }

  const newOfficial = flight.pricing.officialPrice + extraOfficial;
  const newFlytzi = flight.pricing.flytziPrice + extraFlytzi;
  const newSaving = newOfficial - newFlytzi;

  // Actualizar DOM en la tarjeta específica
  const card = checkbox.closest('.flight-card');
  if (card) {
    // Actualizar visualización de ahorro
    const savingElement = card.querySelector(`.badge-saving-tag`);
    if (savingElement) {
      savingElement.innerHTML = `<i class="fa-solid fa-tags"></i> Ahorro Neto: ${formatCurrency(newSaving)}`;
    }
    // Actualizar precio de mercado de forma dinámica
    const marketPriceElement = card.querySelector(`.market-price-crossed`);
    if (marketPriceElement) {
      marketPriceElement.textContent = `Mercado regular: ${formatCurrency(newOfficial)} USD`;
    }
    // Actualizar precio Flytzi destacado
    const flytziPriceElement = card.querySelector(`.flytzi-price-highlight`);
    if (flytziPriceElement) {
      flytziPriceElement.innerHTML = `${formatCurrency(newFlytzi)} <span class="price-sub-label">USD (Tarifa Privada)</span>`;
    }
  }
}

// 7. FLUJO DE CONVERSIÓN: REGISTRO DE PASAJEROS & PASARELA STRIPE SIMULADA
function triggerWhatsAppBooking(flightId) {
  const flight = searchState.flights.find(f => f.flightId === flightId);
  if (!flight) return;

  // Registrar el vuelo activo
  searchState.activeBookingFlight = flight;

  // Calcular precios totales con equipaje incluido
  let extraOfficial = 0;
  let extraFlytzi = 0;
  let baggageList = [];
  const baggage = selectedBaggage[flightId] || { carryOn: false, checked: false };

  if (baggage.carryOn) {
    extraOfficial += flight.pricing.carryOnPriceOfficial;
    extraFlytzi += flight.pricing.carryOnPriceFlytzi;
    baggageList.push("👜 Equipaje de Mano");
  }
  if (baggage.checked) {
    extraOfficial += flight.pricing.checkedPriceOfficial;
    extraFlytzi += flight.pricing.checkedPriceFlytzi;
    baggageList.push("🧳 Equipaje Documentado");
  }

  const finalOfficial = flight.pricing.officialPrice + extraOfficial;
  const finalFlytzi = flight.pricing.flytziPrice + extraFlytzi;
  const finalSaving = finalOfficial - finalFlytzi;

  // Guardar totales calculados de la reserva activa
  searchState.activeBookingTotals = {
    finalOfficial,
    finalFlytzi,
    finalSaving,
    baggageList
  };

  // Llenar el resumen del vuelo en el paso 1
  const summaryDiv = document.getElementById('booking-flight-summary');
  if (summaryDiv) {
    summaryDiv.innerHTML = `
      <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--primary); font-size: 14px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
        <span>✈️ ${flight.originCity} (${flight.origin}) ➔ ${flight.destinationCity} (${flight.destination})</span>
        <span style="color: var(--accent);">${formatCurrency(finalFlytzi)} USD</span>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 8px;">
        <span><strong>Vuelo:</strong> ${flight.flightNumber}</span>
        <span>•</span>
        <span><strong>Clase:</strong> ${flight.cabinClass}</span>
        <span>•</span>
        <span><strong>Pasajeros:</strong> ${flight.passengers}</span>
        ${baggageList.length > 0 ? `<span>•</span><span><strong>Equipaje:</strong> ${baggageList.join(', ')}</span>` : ''}
      </div>
    `;
  }

  // Resetear el formulario de pasajeros y el checkbox
  document.getElementById('passenger-data-form').reset();
  document.getElementById('accept-data-policy').checked = false;

  // Mostrar el modal en el paso 1
  goToStep('form');
  openBookingModal();
}

function openBookingModal() {
  const modal = document.getElementById('booking-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.offsetHeight; // Reflow
    modal.classList.add('active');
  }
}

function closeBookingModal() {
  const modal = document.getElementById('booking-modal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

function goToStep(step) {
  const steps = ['form', 'payment', 'success'];
  steps.forEach(s => {
    const el = document.getElementById(`booking-step-${s}`);
    if (el) {
      el.style.display = s === step ? 'block' : 'none';
    }
  });
}

function goToPaymentStep(event) {
  event.preventDefault();

  // Validar aceptación de políticas de datos
  const acceptCheck = document.getElementById('accept-data-policy');
  if (!acceptCheck || !acceptCheck.checked) {
    alert("Debes leer y aceptar las políticas de confidencialidad y protección de datos para continuar.");
    return;
  }

  // Capturar los datos del formulario de pasajeros
  searchState.passengerDetails = {
    name: document.getElementById('pass-name').value.trim(),
    passport: document.getElementById('pass-passport').value.trim(),
    expiry: document.getElementById('pass-expiry').value,
    dob: document.getElementById('pass-dob').value,
    country: document.getElementById('pass-country').value.trim(),
    email: document.getElementById('pass-email').value.trim(),
    phone: document.getElementById('pass-phone').value.trim(),
    altPhone: document.getElementById('pass-alt-phone').value.trim()
  };

  const flight = searchState.activeBookingFlight;
  const totals = searchState.activeBookingTotals;

  // Llenar el resumen de Stripe
  const stripeSummary = document.getElementById('stripe-billing-summary');
  if (stripeSummary) {
    stripeSummary.innerHTML = `
      <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--primary); font-size: 14px; margin-bottom: 8px; border-bottom: 1.5px dashed var(--border-color); padding-bottom: 6px;">
        RESUMEN DE FACTURACIÓN (STRIPE SECURE)
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
        <span style="color: var(--text-muted);">Itinerario (${flight.origin} - ${flight.destination}):</span>
        <span style="font-weight: 600; color: var(--text-dark);">${formatCurrency(flight.pricing.flytziPrice)} USD</span>
      </div>
      ${totals.baggageList.length > 0 ? `
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
        <span style="color: var(--text-muted);">Cargos de Equipaje Adicional:</span>
        <span style="font-weight: 600; color: var(--text-dark);">${formatCurrency(totals.finalFlytzi - flight.pricing.flytziPrice)} USD</span>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-top: 6px; border-top: 1px solid var(--border-color); padding-top: 6px; font-weight: 700;">
        <span style="color: var(--primary);">Total a Pagar con Stripe:</span>
        <span style="color: var(--accent); font-size: 15px;">${formatCurrency(totals.finalFlytzi)} USD</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; text-decoration: line-through;">
        Tarifa de mercado regular: ${formatCurrency(totals.finalOfficial)} USD (Ahorro total: ${formatCurrency(totals.finalSaving)} USD)
      </div>
    `;
  }

  // Pre-llenar el titular de tarjeta en el formulario de Stripe
  document.getElementById('stripe-card-holder').value = searchState.passengerDetails.name;
  
  // Limpiar campos de tarjeta
  document.getElementById('stripe-card-number').value = '';
  document.getElementById('stripe-card-expiry').value = '';
  document.getElementById('stripe-card-cvc').value = '';

  // Moverse al paso de pago Stripe
  goToStep('payment');
}

function processStripePayment(event) {
  event.preventDefault();

  const cardNum = document.getElementById('stripe-card-number').value.replace(/\s/g, '');
  const cardExpiry = document.getElementById('stripe-card-expiry').value;
  const cardCvc = document.getElementById('stripe-card-cvc').value;
  const cardHolder = document.getElementById('stripe-card-holder').value.trim();

  // Validaciones simuladas básicas de Stripe
  if (cardNum.length < 15) {
    alert("Por favor ingresa un número de tarjeta válido de 15 o 16 dígitos.");
    return;
  }
  if (!cardExpiry.includes('/')) {
    alert("Por favor ingresa la fecha de vencimiento en formato MM/AA.");
    return;
  }
  if (cardCvc.length < 3) {
    alert("Por favor ingresa un código de seguridad (CVC) válido.");
    return;
  }

  // Bloquear botón de envío y simular procesamiento Stripe
  const submitBtn = document.getElementById('stripe-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Procesando con Stripe...`;

  setTimeout(() => {
    // Generar IDs aleatorios realistas de Stripe y GDS
    const stripeChargeId = `ch_${Math.random().toString(36).substring(2, 10).toUpperCase()}_STRIPE_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const locatorCode = `AS-${searchState.passengerDetails.passport.substring(0, 3).toUpperCase()}-${searchState.activeBookingFlight.flightNumber}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Registrar en el estado global
    searchState.activeBookingReceipt = {
      stripeChargeId,
      locatorCode
    };

    // Actualizar recibo visual en el Paso 3
    const flight = searchState.activeBookingFlight;
    const totals = searchState.activeBookingTotals;
    const pass = searchState.passengerDetails;

    document.getElementById('rec-pass-name').textContent = pass.name;
    document.getElementById('rec-pass-passport').textContent = pass.passport;
    document.getElementById('rec-pass-dob').textContent = pass.dob;
    document.getElementById('rec-pass-email').textContent = pass.email;
    document.getElementById('rec-pass-phone').textContent = pass.phone;
    document.getElementById('rec-flight-route').textContent = `${flight.originCity} (${flight.origin}) hacia ${flight.destinationCity} (${flight.destination})`;
    document.getElementById('rec-flight-code').textContent = `${flight.flightNumber} (${flight.cabinClass})`;
    document.getElementById('rec-flight-baggage').textContent = totals.baggageList.length > 0 ? totals.baggageList.join(' + ') : 'Ninguno (Solo artículo personal)';
    document.getElementById('rec-flight-total').textContent = `${formatCurrency(totals.finalFlytzi)} USD`;
    document.getElementById('rec-flight-locator').textContent = locatorCode;
    document.getElementById('rec-stripe-id').textContent = stripeChargeId;

    // Restaurar botón
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Pagar con Stripe</span> <i class="fab fa-stripe-s"></i>`;

    // Moverse al paso de éxito
    goToStep('success');
  }, 2500); // 2.5s para simular procesamiento analítico de alta seguridad
}

function sendReceiptToWhatsApp() {
  const flight = searchState.activeBookingFlight;
  const totals = searchState.activeBookingTotals;
  const pass = searchState.passengerDetails;
  const receipt = searchState.activeBookingReceipt;

  if (!flight || !pass || !receipt) return;

  // Construir mensaje estructurado premium de reserva y pago para WhatsApp
  let message = `¡Hola Flytzi! He completado mi reserva y procesado el pago seguro en Stripe exitosamente. A continuación los detalles oficiales:\n\n`;
  message += `🔑 CÓDIGO LOCALIZADOR: [${receipt.locatorCode}]\n`;
  message += `💳 STRIPE CHARGE ID: [${receipt.stripeChargeId}]\n\n`;
  
  message += `👤 DATOS DEL PASAJERO:\n`;
  message += `   - Nombre: ${pass.name}\n`;
  message += `   - Pasaporte: ${pass.passport} (Emisión: ${pass.country} | Vence: ${pass.expiry} | F. Nacimiento: ${pass.dob})\n`;
  message += `   - Email: ${pass.email}\n`;
  message += `   - Teléfono: ${pass.phone} (Alt: ${pass.altPhone || 'Ninguno'})\n\n`;
  
  message += `✈️ ITINERARIO DE VUELO:\n`;
  message += `   - Ruta: ${flight.originCity} (${flight.origin}) a ${flight.destinationCity} (${flight.destination})\n`;
  message += `   - Vuelo Ida: ${flight.flightNumber} (${flight.cabinClass}) el ${flight.depDate}\n`;
  
  if (flight.returnFlight) {
    message += `   - Vuelo Regreso: ${flight.returnFlight.flightNumber} el ${flight.returnFlight.depDate}\n`;
  }
  
  message += `   - Pasajeros: ${flight.passengers}\n`;
  message += `   - Equipaje: ${totals.baggageList.length > 0 ? totals.baggageList.join(' + ') : 'Solo artículo personal'}\n\n`;

  message += `💰 MONTO TOTAL LIQUIDADO: ${formatCurrency(totals.finalFlytzi)} USD\n`;
  message += `🎉 AHORRO TOTAL DIRECTO: ${formatCurrency(totals.finalSaving)} USD (Ahorraste ${flight.pricing.discountPercent}%)\n\n`;
  message += `Por favor procedan con la validación final del itinerario en su sistema interno y envíenme mi Pase de Abordar oficial. ¡Excelente servicio!`;

  // WhatsApp Business de Flytzi (Prueba)
  const phoneNumber = "523314790654"; 
  const waUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;

  // Abrir ventana en pestaña nueva
  window.open(waUrl, '_blank');
}

// 8. LÓGICA DEL CARRUSEL DE TESTIMONIOS
function startAutoSlide() {
  stopAutoSlide();
  searchState.autoSlideInterval = setInterval(() => {
    slideNext();
  }, 6000);
}

function stopAutoSlide() {
  if (searchState.autoSlideInterval) {
    clearInterval(searchState.autoSlideInterval);
  }
}

function updateCarousel() {
  const track = document.getElementById('carousel-track');
  const dots = document.querySelectorAll('.carousel-dots .dot');
  
  track.style.transform = `translateX(-${searchState.currentSlide * 100}%)`;
  
  // Actualizar dots
  dots.forEach((dot, index) => {
    if (index === searchState.currentSlide) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function slideNext() {
  searchState.currentSlide = (searchState.currentSlide + 1) % 3;
  updateCarousel();
}

function slidePrev() {
  searchState.currentSlide = (searchState.currentSlide - 1 + 3) % 3;
  updateCarousel();
}

function goToSlide(index) {
  stopAutoSlide(); // Detener auto-deslizamiento ante interacción manual del usuario
  searchState.currentSlide = index;
  updateCarousel();
  startAutoSlide(); // Volver a iniciar el ciclo
}

// 9. LÓGICA DE CONTROL DEL MODAL DE CONFIDENCIALIDAD DE DATOS
function openPrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (modal) {
    modal.style.display = 'flex';
    // Forzar reflow para animación
    modal.offsetHeight; 
    modal.classList.add('active');
  }
}

function closePrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (modal) {
    modal.classList.remove('active');
    // Esperar a que la animación termine antes de ocultar
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

// Cerrar al hacer clic fuera del modal card
window.addEventListener('click', (event) => {
  const modal = document.getElementById('privacy-modal');
  if (event.target === modal) {
    closePrivacyModal();
  }
  
  const bookingModal = document.getElementById('booking-modal');
  if (event.target === bookingModal) {
    closeBookingModal();
  }
});

// FORMATEADORES DINÁMICOS DE ENTRADA STRIPE
document.addEventListener('DOMContentLoaded', () => {
  const cardInput = document.getElementById('stripe-card-number');
  const expiryInput = document.getElementById('stripe-card-expiry');

  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) {
          formatted += ' ';
        }
        formatted += value[i];
      }
      e.target.value = formatted;
    });
  }

  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }
});
