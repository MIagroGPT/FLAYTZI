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
            Reservar Tarifa Privada <i class="fab fa-whatsapp"></i>
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

// 7. FLUJO DE CONVERSIÓN: DISPARADOR WHATSAPP BUSINESS CTA
function triggerWhatsAppBooking(flightId) {
  const flight = searchState.flights.find(f => f.flightId === flightId);
  if (!flight) return;

  const passengers = flight.passengers;
  const cabin = flight.cabinClass;
  const flytziPrice = formatCurrency(flight.pricing.flytziPrice);
  const saving = formatCurrency(flight.pricing.saving);
  const discount = flight.pricing.discountPercent;
  
  // Construir mensaje estructurado premium para WhatsApp
  let message = `¡Hola Flytzi! Me interesa reservar la Tarifa Privada optimizada en dólares para el siguiente vuelo:\n\n`;
  message += `✈️ RUTA: ${flight.originCity} (${flight.origin}) hacia ${flight.destinationCity} (${flight.destination})\n`;
  message += `📅 FECHA SALIDA: ${flight.depDate} (Vuelo ${flight.flightNumber})\n`;
  
  if (flight.returnFlight) {
    message += `📅 FECHA REGRESO: ${flight.returnFlight.depDate} (Vuelo ${flight.returnFlight.flightNumber})\n`;
  }
  
  message += `👥 PASAJEROS: ${passengers} (${cabin})\n`;
  message += `💳 TARIFA PRIVADA: ${flytziPrice} USD\n`;
  message += `🎉 DESCUENTO APLICADO: ${discount}% (Ahorro total de ${saving} USD)\n\n`;
  message += `🔑 CÓDIGO DE RUTA OPTIMIZADO: [${flight.flightId}]\n\n`;
  message += `Por favor confirmen la disponibilidad del inventario privado para proceder con la emisión del boleto oficial. ¡Gracias!`;

  // Teléfono ficticio de WhatsApp Business de Flytzi
  const phoneNumber = "5215500000000"; 
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
