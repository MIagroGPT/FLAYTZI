// ==========================================================================
// FLYTZI - CONTROLADOR FRONTEND v2.0 (FLUX DE RESERVA PRE-VALIDADO)
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
  autoSlideInterval: null,
  activeBookingFlight: null,
  activeBookingTotals: null,
  passengerDetails: null,
  createdBooking: null
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
  
  if (depInput) depInput.min = today;
  if (retInput) retInput.min = today;

  if (depInput && retInput) {
    depInput.addEventListener('change', () => {
      retInput.min = depInput.value;
      if (retInput.value && retInput.value < depInput.value) {
        retInput.value = depInput.value;
      }
    });
  }
}

// Alternar entre Ida/Vuelta y Solo Ida
function setTripType(type) {
  searchState.tripType = type;
  
  const tabRound = document.getElementById('tab-roundtrip');
  const tabOne = document.getElementById('tab-oneway');
  const returnGroup = document.getElementById('return-date-group');
  const returnInput = document.getElementById('return-date');

  if (type === 'roundtrip') {
    if (tabRound) tabRound.classList.add('active');
    if (tabOne) tabOne.classList.remove('active');
    if (returnGroup) returnGroup.style.display = 'flex';
    if (returnInput) returnInput.required = true;
  } else {
    if (tabRound) tabRound.classList.remove('active');
    if (tabOne) tabOne.classList.add('active');
    if (returnGroup) returnGroup.style.display = 'none';
    if (returnInput) {
      returnInput.required = false;
      returnInput.value = '';
    }
  }
}

// 3. LÓGICA DE AUTOCOMPLETADO INTELIGENTE (IATA)
function setupAutocomplete(inputId, dropdownId, clearBtnId, hiddenCodeId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const clearBtn = document.getElementById(clearBtnId);
  const hiddenCode = document.getElementById(hiddenCodeId);
  
  if (!input) return;
  let debounceTimer;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'block' : 'none';
    
    if (query.length < 2) {
      if (dropdown) dropdown.style.display = 'none';
      if (hiddenCode) hiddenCode.value = '';
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

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      if (hiddenCode) hiddenCode.value = '';
      clearBtn.style.display = 'none';
      if (dropdown) dropdown.style.display = 'none';
      input.focus();
    });
  }
}

function renderDropdown(airportsList, dropdown, input, hiddenCode, clearBtn) {
  if (!dropdown) return;
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
      if (hiddenCode) hiddenCode.value = airport.code;
      
      // Guardar en el estado para el mensaje final
      if (input.id === 'origin-input') {
        searchState.originName = `${airport.city} (${airport.code})`;
      } else {
        searchState.destName = `${airport.city} (${airport.code})`;
      }

      dropdown.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'block';
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

  if (!originInput || !destInput) return;

  const tempVal = originInput.value;
  const tempCode = originCode.value;
  const tempName = searchState.originName;

  originInput.value = destInput.value;
  originCode.value = destCode.value;
  searchState.originName = searchState.destName;

  destInput.value = tempVal;
  destCode.value = tempCode;
  searchState.destName = tempName;

  if (clearOrigin) clearOrigin.style.display = originInput.value ? 'block' : 'none';
  if (clearDest) clearDest.style.display = destInput.value ? 'block' : 'none';
}

// 4. FLUJO DE BÚSQUEDA Y COMUNICACIÓN API (PostgreSQL pre-validado)
function handleSearch(event) {
  event.preventDefault();

  const origin = document.getElementById('origin-code').value;
  const destination = document.getElementById('dest-code').value;
  const departureDate = document.getElementById('departure-date').value;
  const returnDate = document.getElementById('return-date').value;
  const passengers = document.getElementById('passengers-select').value;
  const cabinClass = document.getElementById('class-select').value;

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

  const resultsSec = document.getElementById('results-section');
  const loader = document.getElementById('results-loader');
  const emptyState = document.getElementById('results-empty');
  const listContainer = document.getElementById('flights-list');
  const resultsCount = document.getElementById('results-count');

  if (resultsSec) resultsSec.style.display = 'block';
  if (loader) loader.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  if (listContainer) listContainer.innerHTML = '';
  if (resultsCount) resultsCount.textContent = 'Consultando inventario de millas...';

  if (resultsSec) resultsSec.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const flexDates = document.getElementById('flex-dates-check').checked;
  
  // Construir consulta URL apuntando a la nueva API v2
  let url = `/api/inventory/search?origin=${origin}&destination=${destination}&departure_date=${departureDate}&passengers=${passengers}&cabin=${cabinClass}&flexDates=${flexDates}`;
  if (searchState.tripType === 'roundtrip' && returnDate) {
    url += `&return_date=${returnDate}`;
  }

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Respuesta inválida del servidor');
      return res.json();
    })
    .then(data => {
      searchState.flights = data;
      searchState.filteredFlights = [...data];
      
      setTimeout(() => {
        if (loader) loader.style.display = 'none';
        
        if (data.length === 0) {
          if (emptyState) emptyState.style.display = 'block';
          if (resultsCount) resultsCount.textContent = '0 vuelos pre-validados disponibles';
        } else {
          renderFlightCards(data);
          if (resultsCount) resultsCount.textContent = `${data.length} opciones de vuelo de millas disponibles`;
        }
      }, 1000);
    })
    .catch(err => {
      console.error("Error en búsqueda:", err);
      setTimeout(() => {
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (resultsCount) resultsCount.textContent = 'Error al consultar disponibilidad';
      }, 1000);
    });
}

// 5. RENDERIZADO DE TARJETAS DE VUELO CON CALCULADORA FLYTZI
function renderFlightCards(flights) {
  const container = document.getElementById('flights-list');
  if (!container) return;
  container.innerHTML = '';

  flights.forEach(flight => {
    const card = document.createElement('div');
    card.className = 'flight-card';
    
    const officialPriceFormatted = formatCurrency(flight.pricing.officialPrice);
    const flytziPriceFormatted = formatCurrency(flight.pricing.flytziPrice);
    const savingFormatted = formatCurrency(flight.pricing.saving);

    // Contenido del vuelo de ida
    let outboundHTML = `
      <div class="itinerary-row ${flight.returnFlight ? '' : 'no-border'}">
        <div class="airline-info">
          <div class="airline-logo-badge ${flight.operatingLogo || flight.logo}">${flight.operatingLogo || flight.logo}</div>
          <div class="airline-details">
            <span class="airline-name">${flight.airline}</span>
            <span style="font-size: 11px; color: var(--accent); font-weight: 700; margin-top: 1px;"><i class="fa-solid fa-circle-check"></i> Aerolínea Operadora: ${flight.operatingAirline || flight.airline}</span>
            <span class="flight-code">${flight.flightNumber} • Ida: ${flight.depDate}</span>
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
            <div class="airline-logo-badge ${ret.operatingLogo || ret.logo || flight.logo}">${ret.operatingLogo || ret.logo || flight.logo}</div>
            <div class="airline-details">
              <span class="airline-name">${ret.airline || flight.airline}</span>
              <span style="font-size: 11px; color: var(--accent); font-weight: 700; margin-top: 1px;"><i class="fa-solid fa-circle-check"></i> Aerolínea Operadora: ${ret.operatingAirline || ret.airline || flight.airline}</span>
              <span class="flight-code">${ret.flightNumber} • Regreso: ${ret.depDate}</span>
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

    card.innerHTML = `
      <div class="flight-main-info">
        ${outboundHTML}
        ${inboundHTML}
      </div>
      
      <div class="flight-price-actions">
        <div class="flight-badge-row" style="gap: 8px 12px; margin-bottom: 12px;">
          ${flight.isFlexibleDate ? `<span class="flight-badge-pill" style="background: #FFFBEB; color: #D97706; font-weight: 700; border: 1px solid #FCD34D; font-size: 11px;"><i class="fa-solid fa-calendar-days"></i> Fecha Flexible (${flight.flexibleDateDiff})</span>` : ''}
          <span class="flight-badge-pill badge-cabin"><i class="fa-solid fa-crown"></i> Clase ${flight.cabinClass}</span>
          <span class="flight-badge-pill badge-passengers"><i class="fa-solid fa-user"></i> ${flight.passengers} Pasajero(s)</span>
          <span class="flight-badge-pill badge-saving-tag"><i class="fa-solid fa-tags"></i> Ahorro Neto: ${savingFormatted}</span>
          <span class="flight-badge-pill" style="background: rgba(16, 185, 129, 0.1); color: var(--accent); font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 11px;"><i class="fa-solid fa-gem"></i> Inventario Autorizado</span>
        </div>

        <div class="baggage-selector-block" style="margin: 12px 0; padding: 10px; background: rgba(16, 185, 129, 0.05); border-radius: var(--border-radius); border: 1px dashed rgba(16, 185, 129, 0.2);">
          <span class="baggage-title" style="font-size: 13px; font-weight: 700; color: var(--text-dark); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <i class="fa-solid fa-suitcase"></i> Agregar Equipaje (Optimizado)
          </span>
          <div class="baggage-options" style="display: flex; flex-wrap: wrap; gap: 12px;">
            <label class="baggage-option" style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-dark); cursor: pointer;">
              <input type="checkbox" onchange="toggleBaggage(this, '${flight.flightId}', 'carryOn')" style="width: 16px; height: 16px; accent-color: var(--primary);">
              <span>Mano (Gratuito con Millas)</span>
            </label>
            <label class="baggage-option" style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-dark); cursor: pointer;">
              <input type="checkbox" onchange="toggleBaggage(this, '${flight.flightId}', 'checked')" style="width: 16px; height: 16px; accent-color: var(--primary);">
              <span>Documentado (Incluido en tarifa)</span>
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
          <button class="btn btn-primary btn-book" onclick="triggerBookingFlow('${flight.flightId}')">
            Solicitar Reserva
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function filterResults(filterType) {
  const filterBtns = document.querySelectorAll('.results-filters .filter-btn');
  filterBtns.forEach(btn => btn.classList.remove('active'));
  
  if (event && event.target) {
    event.target.classList.add('active');
  }

  if (filterType === 'all') {
    searchState.filteredFlights = [...searchState.flights];
  } else if (filterType === 'direct') {
    searchState.filteredFlights = searchState.flights.filter(f => f.stops === 0);
  } else if (filterType === 'cheapest') {
    searchState.filteredFlights = [...searchState.flights].sort((a, b) => a.pricing.flytziPrice - b.pricing.flytziPrice);
  }

  renderFlightCards(searchState.filteredFlights);
}

const selectedBaggage = {};
function toggleBaggage(checkbox, flightId, type) {
  if (!selectedBaggage[flightId]) {
    selectedBaggage[flightId] = { carryOn: false, checked: false };
  }
  selectedBaggage[flightId][type] = checkbox.checked;
}

// 6. SOLICITUD DE BÚSQUEDA MANUAL SI NO HAY INVENTARIO
function openManualRequestModal() {
  const origin = document.getElementById('origin-code').value;
  const destination = document.getElementById('dest-code').value;
  const departureDate = document.getElementById('departure-date').value;
  const returnDate = document.getElementById('return-date').value;
  const passengers = document.getElementById('passengers-select').value;
  const cabinClass = document.getElementById('class-select').value;

  // Crear un objeto de vuelo manual simulado para el modal
  const manualFlight = {
    flightId: '',
    airline: 'Búsqueda Manual Concierge',
    flightNumber: 'Pendiente',
    origin: origin || 'MIA',
    originCity: searchState.originName ? searchState.originName.split(' ')[0] : 'Origen',
    destination: destination || 'MAD',
    destinationCity: searchState.destName ? searchState.destName.split(' ')[0] : 'Destino',
    depTime: '--:--',
    arrTime: '--:--',
    depDate: getFormattedDate(departureDate || new Date()),
    depDateRaw: departureDate || new Date().toISOString().split('T')[0],
    duration: 'A validar',
    stops: 0,
    cabinClass: cabinClass === 'business' ? 'Business / Primera' : 'Económica',
    passengers: parseInt(passengers) || 1,
    pricing: {
      officialPrice: 0,
      flytziPrice: 0,
      saving: 0,
      discountPercent: 35
    }
  };

  if (returnDate) {
    manualFlight.returnFlight = {
      flightNumber: 'Pendiente',
      airline: 'Búsqueda Manual Concierge',
      origin: destination,
      originCity: manualFlight.destinationCity,
      destination: origin,
      destinationCity: manualFlight.originCity,
      depTime: '--:--',
      arrTime: '--:--',
      depDate: getFormattedDate(returnDate),
      depDateRaw: returnDate,
      duration: 'A validar',
      stops: 0
    };
  }

  searchState.activeBookingFlight = manualFlight;
  searchState.activeBookingTotals = {
    finalOfficial: 0,
    finalFlytzi: 0,
    finalSaving: 0,
    baggageList: ['Mano Incluida', 'Documentado Incluido']
  };

  const summaryDiv = document.getElementById('booking-flight-summary');
  if (summaryDiv) {
    summaryDiv.innerHTML = `
      <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--primary); font-size: 14px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
        <span>🔍 BÚSQUEDA MANUAL: ${manualFlight.originCity} ➔ ${manualFlight.destinationCity}</span>
        <span style="color: var(--accent);">Tarifa Privada a Cotizar</span>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 8px;">
        <span><strong>Clase:</strong> ${manualFlight.cabinClass}</span>
        <span>•</span>
        <span><strong>Pasajeros:</strong> ${manualFlight.passengers}</span>
        <span>•</span>
        <span><strong>Fecha:</strong> ${manualFlight.depDate} ${returnDate ? ` / Regreso: ${getFormattedDate(returnDate)}` : ''}</span>
      </div>
    `;
  }

  document.getElementById('passenger-data-form').reset();
  document.getElementById('accept-data-policy').checked = false;

  goToStep('form');
  openBookingModal();
}

function getFormattedDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const options = { weekday: 'short', day: '2-digit', month: 'short' };
  return date.toLocaleDateString('es-ES', options);
}

// 7. ABRIR FORMULARIO DE RESERVA CON INVENTARIO
function triggerBookingFlow(flightId) {
  const flight = searchState.flights.find(f => f.flightId === flightId);
  if (!flight) return;

  searchState.activeBookingFlight = flight;

  const baggage = selectedBaggage[flightId] || { carryOn: false, checked: false };
  let baggageList = ['Mano Incluido', 'Documentado Incluido'];

  searchState.activeBookingTotals = {
    finalOfficial: flight.pricing.officialPrice,
    finalFlytzi: flight.pricing.flytziPrice,
    finalSaving: flight.pricing.saving,
    baggageList
  };

  let operadorasStr = flight.operatingAirline || flight.airline;
  if (flight.returnFlight) {
    const retOp = flight.returnFlight.operatingAirline || flight.returnFlight.airline || flight.airline;
    if (retOp !== operadorasStr) {
      operadorasStr += ` / ${retOp}`;
    }
  }

  const summaryDiv = document.getElementById('booking-flight-summary');
  if (summaryDiv) {
    summaryDiv.innerHTML = `
      <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: var(--primary); font-size: 14px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
        <span>✈️ ${flight.originCity} (${flight.origin}) ➔ ${flight.destinationCity} (${flight.destination})</span>
        <span style="color: var(--accent);">${formatCurrency(flight.pricing.flytziPrice)} USD</span>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 8px;">
        <span><strong>Vuelo:</strong> ${flight.flightNumber}</span>
        <span>•</span>
        <span><strong>Clase:</strong> ${flight.cabinClass}</span>
        <span>•</span>
        <span><strong>Pasajeros:</strong> ${flight.passengers}</span>
        <span>•</span>
        <span><strong>Operador:</strong> ${operadorasStr}</span>
      </div>
    `;
  }

  document.getElementById('passenger-data-form').reset();
  document.getElementById('accept-data-policy').checked = false;

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
  const steps = ['form', 'success'];
  steps.forEach(s => {
    const el = document.getElementById(`booking-step-${s}`);
    if (el) {
      el.style.display = s === step ? 'block' : 'none';
    }
  });
}

// 8. ENVIAR SOLICITUD DE RESERVA A PostgreSQL (API v2)
function submitBookingRequest(event) {
  event.preventDefault();

  const acceptCheck = document.getElementById('accept-data-policy');
  if (!acceptCheck || !acceptCheck.checked) {
    alert("Debes aceptar las políticas de privacidad para continuar.");
    return;
  }

  const submitBtn = document.getElementById('btn-submit-booking');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando reserva...`;

  const flight = searchState.activeBookingFlight;
  const totals = searchState.activeBookingTotals;

  const payload = {
    inventory_id: flight.flightId || null,
    passenger_name: document.getElementById('pass-name').value.trim(),
    passenger_email: document.getElementById('pass-email').value.trim(),
    passenger_phone: document.getElementById('pass-phone').value.trim(),
    passport_number: document.getElementById('pass-passport').value.trim(),
    passport_country: document.getElementById('pass-country').value.trim(),
    passport_expiry: document.getElementById('pass-expiry').value,
    date_of_birth: document.getElementById('pass-dob').value,
    origin: flight.origin,
    destination: flight.destination,
    departure_date: flight.depDateRaw,
    return_date: flight.returnFlight ? flight.returnFlight.depDateRaw : null,
    cabin: flight.cabinClass === 'Business / Primera' ? 'business' : 'economy',
    passengers: flight.passengers,
    price_quoted: totals.finalFlytzi
  };

  fetch('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (!res.ok) throw new Error('Error al guardar la reserva en base de datos.');
    return res.json();
  })
  .then(data => {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Confirmar Solicitud de Reserva <i class="fa-solid fa-plane-circle-check"></i>`;

    searchState.createdBooking = data;
    searchState.passengerDetails = payload;

    // Actualizar pantalla de éxito
    document.getElementById('rec-pass-name').textContent = payload.passenger_name;
    document.getElementById('rec-pass-passport').textContent = payload.passport_number;
    document.getElementById('rec-pass-email').textContent = payload.passenger_email;
    document.getElementById('rec-pass-phone').textContent = payload.passenger_phone;
    
    document.getElementById('rec-flight-route').textContent = `${flight.originCity} hacia ${flight.destinationCity}`;
    document.getElementById('rec-flight-code').textContent = flight.flightId ? `${flight.flightNumber} (${flight.cabinClass})` : 'A cotizar por conserjería';
    document.getElementById('rec-flight-baggage').textContent = totals.baggageList.join(' + ');
    document.getElementById('rec-flight-total').textContent = flight.flightId ? `${formatCurrency(totals.finalFlytzi)} USD` : 'Por definir (Búsqueda Manual)';
    
    document.getElementById('rec-booking-id').textContent = data.booking_id;

    goToStep('success');
  })
  .catch(err => {
    console.error("Booking Error:", err);
    alert("Hubo un error al registrar tu reserva. Por favor intenta de nuevo o comunícate con soporte.");
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Confirmar Solicitud de Reserva <i class="fa-solid fa-plane-circle-check"></i>`;
  });
}

// 9. ENVIAR MENSAJE ESTRUCTURADO A WHATSAPP
function sendRequestToWhatsApp() {
  const flight = searchState.activeBookingFlight;
  const pass = searchState.passengerDetails;
  const booking = searchState.createdBooking;

  if (!flight || !pass || !booking) return;

  let message = `¡Hola Flytzi! He registrado una solicitud de reserva desde el metabuscador web. A continuación los detalles:\n\n`;
  message += `🆔 ID SOLICITUD: ${booking.booking_id}\n`;
  message += `🚦 ESTADO: ${booking.status.toUpperCase()}\n\n`;
  
  message += `👤 DATOS DEL PASAJERO:\n`;
  message += `   - Nombre: ${pass.passenger_name}\n`;
  message += `   - Pasaporte: ${pass.passport_number} (País: ${pass.passport_country} | Vence: ${pass.passport_expiry})\n`;
  message += `   - Email: ${pass.passenger_email}\n`;
  message += `   - Celular: ${pass.passenger_phone}\n\n`;
  
  message += `✈️ VUELO SOLICITADO:\n`;
  message += `   - Ruta: ${flight.originCity} (${flight.origin}) a ${flight.destinationCity} (${flight.destination})\n`;
  message += `   - Fecha de Salida: ${pass.departure_date} (${flight.cabinClass})\n`;
  if (pass.return_date) {
    message += `   - Fecha de Regreso: ${pass.return_date}\n`;
  }
  message += `   - Pasajeros: ${pass.passengers}\n`;
  message += `   - Inventario de Millas: ${flight.flightId ? 'Pre-validado' : 'Requiere búsqueda manual'}\n\n`;

  if (flight.flightId) {
    message += `💰 TARIFA PRIVADA: ${formatCurrency(booking.price_quoted)} USD\n\n`;
  }
  message += `Quedo a la espera de que validen la disponibilidad final en firme para recibir mi enlace seguro de pago por Stripe. ¡Muchas gracias!`;

  const phoneNumber = "523314790654"; 
  const waUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

// 10. LÓGICA DEL CARRUSEL DE TESTIMONIOS
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
  if (!track) return;
  
  track.style.transform = `translateX(-${searchState.currentSlide * 100}%)`;
  
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
  stopAutoSlide();
  searchState.currentSlide = index;
  updateCarousel();
  startAutoSlide();
}

// 11. MODALES
function openPrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.offsetHeight; 
    modal.classList.add('active');
  }
}

function closePrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

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
