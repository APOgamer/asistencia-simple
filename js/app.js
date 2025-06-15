// Almacenamiento de datos
let alumnosData = [];
let asistenciasData = [];
let selectedAttendanceFiles = new Set();

// Configuración de WhatsApp
const WSP_TOKEN = 'EAAUJUvz0VZBEBO4CM5UcvlRz3y3vx1zZAwHuOwf1fZBOYb0RKxU43tXXigdBc2JAYDgvpWeHzmB8jVcOOqwJisSpaTtbfbUs1YSDt4qGzEZCBRTC8YtCZCcMXTLgvliJhlZBiVn1m4mxucgRSJrMsI4HxOfwNP5fZA83d9cW6aHXNmxupRmarbZAPsZAb7rmqaQEiIdIcAhlUX2Somyxo';
const WSP_PHONE_ID = '651602738042158';

// Configuración de turnos
const CONFIG_TURNOS = {
    turnos: {
        mañana: {
            hora_puntual: "07:30",
            llegar_tarde_desde: "07:31"
        },
        tarde: {
            hora_puntual: "13:10",
            llegar_tarde_desde: "13:11"
        }
    }
};

// Cargar lista de archivos disponibles
async function loadAvailableFiles() {
    try {
        const response = await fetch('/uploads');
        const files = await response.json();
        
        const excelSelect = document.getElementById('excelFileSelect');
        excelSelect.innerHTML = '<option value="">Seleccione un archivo Excel</option>';
        
        files.forEach(file => {
            if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file;
                excelSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Error al cargar archivos:', error);
    }
}

// Vista previa del archivo .dat
async function previewDatFile() {
    const fileInput = document.getElementById('datFile');
    const dateInput = document.getElementById('attendanceDate');
    const file = fileInput.files[0];
    const previewBox = document.getElementById('datPreview');
    
    if (!file) {
        previewBox.innerHTML = '';
        return;
    }

    try {
        const content = await file.text();
        const asistencias = processDatFile(content);
        
        // Detectar la fecha más reciente
        if (asistencias.length > 0) {
            const fechas = asistencias.map(a => a.fechaHora.split(' ')[0]);
            const fechasUnicas = [...new Set(fechas)];
            const fechasOrdenadas = fechasUnicas.sort((a, b) => new Date(b) - new Date(a));
            if (fechasOrdenadas.length > 0) {
                dateInput.value = fechasOrdenadas[0];
            }
        }
        
        // Filtrar por fecha si se ha seleccionado una
        let asistenciasFiltradas = asistencias;
        if (dateInput.value) {
            const fechaSeleccionada = new Date(dateInput.value).toISOString().split('T')[0];
            asistenciasFiltradas = asistencias.filter(a => {
                const fechaAsistencia = a.fechaHora.split(' ')[0];
                return fechaAsistencia === fechaSeleccionada;
            });
        }
        
        previewBox.innerHTML = `
            <h4>Vista Previa</h4>
            <p>Total de registros: ${asistenciasFiltradas.length}</p>
            ${dateInput.value ? `<p>Registros para la fecha ${dateInput.value}: ${asistenciasFiltradas.length}</p>` : ''}
            <table>
                <thead>
                    <tr>
                        <th>Número</th>
                        <th>Fecha y Hora</th>
                    </tr>
                </thead>
                <tbody>
                    ${asistenciasFiltradas.slice(0, 5).map(a => `
                        <tr>
                            <td>${a.numero}</td>
                            <td>${a.fechaHora}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${asistenciasFiltradas.length > 5 ? `<p>... y ${asistenciasFiltradas.length - 5} registros más</p>` : ''}
        `;
    } catch (error) {
        previewBox.innerHTML = `<p class="error">Error al procesar el archivo: ${error.message}</p>`;
    }
}

// Subir archivo .dat
async function uploadDatFile() {
    const fileInput = document.getElementById('datFile');
    const dateInput = document.getElementById('attendanceDate');
    const file = fileInput.files[0];
    
    if (!file || !dateInput.value) {
        alert('Por favor, selecciona un archivo y una fecha');
        return;
    }

    try {
        // Leer el contenido del archivo
        const content = await file.text();
        const todasLasAsistencias = processDatFile(content);
        
        // Filtrar solo las asistencias del día seleccionado
        const [year, month, day] = dateInput.value.split('-').map(Number);
        const fechaSeleccionada = new Date(year, month - 1, day);
        
        const nuevasAsistencias = todasLasAsistencias.filter(asistencia => {
            const [fecha, hora] = asistencia.fechaHora.split(' ');
            const [year, month, day] = fecha.split('-').map(Number);
            const fechaAsistencia = new Date(year, month - 1, day);
            
            console.log('Comparando fechas:', {
                fechaSeleccionada: fechaSeleccionada.toISOString(),
                fechaAsistencia: fechaAsistencia.toISOString(),
                fechaOriginal: asistencia.fechaHora,
                añoSeleccionado: fechaSeleccionada.getFullYear(),
                mesSeleccionado: fechaSeleccionada.getMonth(),
                diaSeleccionado: fechaSeleccionada.getDate(),
                añoAsistencia: fechaAsistencia.getFullYear(),
                mesAsistencia: fechaAsistencia.getMonth(),
                diaAsistencia: fechaAsistencia.getDate()
            });
            
            // Comparar año, mes y día por separado
            const mismoAño = fechaAsistencia.getFullYear() === fechaSeleccionada.getFullYear();
            const mismoMes = fechaAsistencia.getMonth() === fechaSeleccionada.getMonth();
            const mismoDia = fechaAsistencia.getDate() === fechaSeleccionada.getDate();
            
            return mismoAño && mismoMes && mismoDia;
        });
        
        console.log('Subiendo archivo:', {
            fechaSeleccionada: fechaSeleccionada.toISOString(),
            totalRegistros: todasLasAsistencias.length,
            registrosFiltrados: nuevasAsistencias.length,
            fechaInput: dateInput.value,
            registrosFiltradosDetalle: nuevasAsistencias.map(a => a.fechaHora)
        });
        
        if (nuevasAsistencias.length === 0) {
            alert('No se encontraron registros para la fecha seleccionada. Por favor, verifica la fecha.');
            return;
        }
        
        // Obtener asistencias existentes
        const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
        const fechaClave = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Combinar asistencias existentes con nuevas
        const asistenciasExistentes = asistenciasGuardadas[fechaClave]?.asistencias || [];
        const asistenciasCombinadas = [...asistenciasExistentes];
        
        // Actualizar o agregar nuevas asistencias
        nuevasAsistencias.forEach(nuevaAsistencia => {
            const index = asistenciasCombinadas.findIndex(a => a.numero === nuevaAsistencia.numero);
            if (index !== -1) {
                asistenciasCombinadas[index] = nuevaAsistencia;
            } else {
                asistenciasCombinadas.push(nuevaAsistencia);
            }
        });
        
        // Guardar asistencias actualizadas
        asistenciasGuardadas[fechaClave] = {
            filename: file.name,
            asistencias: asistenciasCombinadas,
            count: asistenciasCombinadas.length
        };
        localStorage.setItem('asistenciasData', JSON.stringify(asistenciasGuardadas));
        
        alert(`Archivo procesado correctamente.\nTotal de registros en el archivo: ${todasLasAsistencias.length}\nRegistros del día ${dateInput.value}: ${nuevasAsistencias.length}`);
        
        // Limpiar formulario
        fileInput.value = '';
        dateInput.value = '';
        document.getElementById('datPreview').innerHTML = '';
        
        // Actualizar lista de asistencias
        await loadAttendanceFiles();
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar el archivo');
    }
}

// Cargar archivos de asistencia
async function loadAttendanceFiles() {
    try {
        console.log('\n=== Rastreo de fechas en loadAttendanceFiles ===');
        
        const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
        console.log('1. Datos en localStorage:', asistenciasGuardadas);
        
        const container = document.getElementById('attendanceData');
        const fechasOrdenadas = Object.entries(asistenciasGuardadas)
            .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA));
            
        console.log('2. Fechas ordenadas:', fechasOrdenadas);
        
        container.innerHTML = fechasOrdenadas.map(([date, data]) => {
            // Ajustar la fecha para evitar el desfase UTC
            const [year, month, day] = date.split('-').map(Number);
            const fechaObj = new Date(year, month - 1, day);
            
            console.log('3. Procesando fecha:', {
                fechaOriginal: date,
                fechaObj: fechaObj.toISOString(),
                fechaFormateada: fechaObj.toLocaleDateString('es-ES'),
                componentes: { year, month, day }
            });
            
            return `
                <div class="attendance-card" data-date="${date}">
                    <div class="attendance-info">
                        <div class="attendance-date">${fechaObj.toLocaleDateString('es-ES')}</div>
                        <div class="attendance-count">${data.count} registros</div>
                        <div class="attendance-preview">
                            <button onclick="showAttendancePreview('${date}')">Ver Detalles</button>
                        </div>
                    </div>
                    <div class="attendance-checkbox">
                        <input type="checkbox" 
                               onchange="toggleAttendanceSelection('${date}')"
                               ${selectedAttendanceFiles.has(date) ? 'checked' : ''}>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error al cargar archivos de asistencia:', error);
    }
}

// Función para determinar el turno de una sección
function getTurno(seccion) {
    const letra = seccion.slice(-1).toUpperCase();
    return (letra === 'E' || letra === 'F') ? 'TARDE' : 'MAÑANA';
}

// Función para convertir hora a minutos para comparación
function horaAMinutos(hora) {
    const [horas, minutos] = hora.split(':').map(Number);
    return horas * 60 + minutos;
}

// Función para determinar si un alumno falta según su turno
function determinarFalta(alumno, asistencias, fecha) {
    console.log('\n=== Rastreo de fechas en determinarFalta ===');
    console.log('1. Fecha recibida como parámetro:', fecha);
    
    const turno = getTurno(alumno.seccion);
    
    // Asegurarnos de que tenemos un objeto Date
    const fechaAsistencia = fecha instanceof Date ? fecha : new Date(fecha);
    
    console.log('2. Fecha convertida a objeto Date:', fechaAsistencia);
    console.log('3. Fecha en formato ISO:', fechaAsistencia.toISOString());
    
    // Filtrar asistencias por fecha
    const asistenciasDelDia = asistencias.filter(a => {
        const [fecha, hora] = a.fechaHora.split(' ');
        const [year, month, day] = fecha.split('-').map(Number);
        const fechaRegistro = new Date(year, month - 1, day);
        
        console.log('4. Comparando fechas:', {
            fechaAsistencia: fechaAsistencia.toISOString(),
            fechaRegistro: fechaRegistro.toISOString(),
            fechaHoraOriginal: a.fechaHora
        });
        return fechaRegistro.toDateString() === fechaAsistencia.toDateString();
    });
    
    return !asistenciasDelDia.some(a => a.numero === alumno.numero);
}

// Función para obtener la hora de llegada de un alumno
function obtenerHoraLlegada(alumno, asistencias, fecha) {
    const turno = getTurno(alumno.seccion);
    const fechaAsistencia = new Date(fecha);
    
    // Filtrar asistencias por fecha
    const asistenciasDelDia = asistencias.filter(a => {
        const fechaRegistro = new Date(a.fechaHora);
        return fechaRegistro.toDateString() === fechaAsistencia.toDateString();
    });

    // Obtener configuración del turno
    const configTurno = CONFIG_TURNOS.turnos[turno.toLowerCase()];
    const horaPuntual = horaAMinutos(configTurno.hora_puntual);
    const horaTarde = horaAMinutos(configTurno.llegar_tarde_desde);

    // Filtrar asistencias según el turno
    const asistenciasTurno = asistenciasDelDia.filter(a => {
        const fechaHora = new Date(a.fechaHora);
        const horaAsistencia = fechaHora.getHours() * 60 + fechaHora.getMinutes();
        
        if (turno === 'MAÑANA') {
            return horaAsistencia >= horaPuntual - 60 && horaAsistencia <= horaTarde + 60;
        } else {
            return horaAsistencia >= horaPuntual - 60 && horaAsistencia <= horaTarde + 60;
        }
    });

    // Encontrar la asistencia del alumno
    const asistencia = asistenciasTurno.find(a => a.numero === alumno.numero);
    return asistencia ? asistencia.fechaHora : null;
}

// Botón para actualizar la vista previa del .dat según la fecha seleccionada
function actualizarVistaPreviaDat() {
    const fileInput = document.getElementById('datFile');
    const dateInput = document.getElementById('attendanceDate');
    const file = fileInput.files[0];
    const previewBox = document.getElementById('datPreview');
    if (!file) {
        previewBox.innerHTML = '';
        return;
    }
    file.text().then(content => {
        const asistencias = processDatFile(content);
        let asistenciasFiltradas = asistencias;
        if (dateInput.value) {
            const fechaSeleccionada = new Date(dateInput.value).toISOString().split('T')[0];
            asistenciasFiltradas = asistencias.filter(a => {
                const fechaAsistencia = a.fechaHora.split(' ')[0];
                return fechaAsistencia === fechaSeleccionada;
            });
        }
        previewBox.innerHTML = `
            <h4>Vista Previa</h4>
            <p>Total de registros: ${asistenciasFiltradas.length}</p>
            ${dateInput.value ? `<p>Registros para la fecha ${dateInput.value}: ${asistenciasFiltradas.length}</p>` : ''}
            <table>
                <thead>
                    <tr>
                        <th>Número</th>
                        <th>Fecha y Hora</th>
                    </tr>
                </thead>
                <tbody>
                    ${asistenciasFiltradas.slice(0, 20).map(a => `
                        <tr>
                            <td>${a.numero}</td>
                            <td>${a.fechaHora}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${asistenciasFiltradas.length > 20 ? `<p>... y ${asistenciasFiltradas.length - 20} registros más</p>` : ''}
        `;
    });
}

// Optimizar la vista previa de detalles de asistencias (modal) para mostrar solo 30 filas por sección y permitir mostrar más
function renderAlumnosPorSeccionConPaginacion(alumnosPorSeccion, tipo) {
    let html = '';
    Object.entries(alumnosPorSeccion).forEach(([seccion, alumnos]) => {
        html += `
            <div class="seccion-grupo">
                <h4>Sección ${seccion}</h4>
                <table>
                    <thead>
                        <tr>
                            <th>Número</th>
                            <th>Nombre</th>
                            <th>Celular</th>
                            ${tipo === 'presentes' ? '<th>Hora de Llegada</th>' : ''}
                        </tr>
                    </thead>
                    <tbody id="tbody-${tipo}-${seccion}">
                        ${alumnos.slice(0, 30).map(alumno => `
                            <tr>
                                <td>${alumno.numero}</td>
                                <td>${alumno.nombre}</td>
                                <td>${alumno.celular}</td>
                                ${tipo === 'presentes' ? `<td>${alumno.hora ? new Date(alumno.hora).toLocaleTimeString() : '-'}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${alumnos.length > 30 ? `<button class="ver-mas-btn" onclick="verMasAlumnos('${tipo}','${seccion}')">Ver más</button>` : ''}
            </div>
        `;
    });
    return html;
}

window.verMasAlumnos = function(tipo, seccion) {
    const tbody = document.getElementById(`tbody-${tipo}-${seccion}`);
    const alumnosPorSeccion = tipo === 'presentes' ? window._presentesPorSeccion : window._faltantesPorSeccion;
    const alumnos = alumnosPorSeccion[seccion];
    const mostrados = tbody.children.length;
    const nuevos = alumnos.slice(mostrados, mostrados + 30);
    nuevos.forEach(alumno => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${alumno.numero}</td>
            <td>${alumno.nombre}</td>
            <td>${alumno.celular}</td>
            ${tipo === 'presentes' ? `<td>${alumno.hora ? new Date(alumno.hora).toLocaleTimeString() : '-'}</td>` : ''}
        `;
        tbody.appendChild(tr);
    });
    if (mostrados + 30 >= alumnos.length) {
        tbody.parentElement.nextElementSibling?.remove(); // Quita el botón si ya no hay más
    }
}

// Modificar showAttendancePreview para usar la paginación
async function showAttendancePreview(date) {
    try {
        console.log('\n=== Rastreo de fechas en showAttendancePreview ===');
        console.log('1. Fecha recibida como parámetro:', date);
        
        const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
        const data = asistenciasGuardadas[date];
        
        if (!data) {
            throw new Error('No se encontraron datos para esta fecha');
        }
        
        console.log('2. Datos encontrados en localStorage:', {
            fechaClave: date,
            primeraAsistencia: data.asistencias[0],
            fechaHoraPrimeraAsistencia: data.asistencias[0]?.fechaHora
        });
        
        const asistencias = data.asistencias;
        
        // Obtener la fecha real del primer registro
        const primeraAsistencia = asistencias[0];
        let fechaReal;
        
        if (primeraAsistencia) {
            const [fecha, hora] = primeraAsistencia.fechaHora.split(' ');
            const [year, month, day] = fecha.split('-').map(Number);
            const [hours, minutes, seconds] = hora.split(':').map(Number);
            fechaReal = new Date(year, month - 1, day, hours, minutes, seconds);
        } else {
            const [year, month, day] = date.split('-').map(Number);
            fechaReal = new Date(year, month - 1, day);
        }
        
        console.log('3. Fecha real calculada:', {
            fechaReal: fechaReal.toISOString(),
            fechaRealLocal: fechaReal.toLocaleDateString('es-ES')
        });
        
        // Separar alumnos presentes y faltantes considerando turnos
        const alumnosPresentes = alumnosData.filter(alumno => 
            !determinarFalta(alumno, asistencias, fechaReal)
        );
        
        const alumnosFaltantes = alumnosData.filter(alumno => 
            determinarFalta(alumno, asistencias, fechaReal)
        );
        
        console.log('Resumen de asistencia:', {
            totalAlumnos: alumnosData.length,
            presentes: alumnosPresentes.length,
            faltantes: alumnosFaltantes.length
        });
        
        // Agrupar por sección
        const presentesPorSeccion = alumnosPresentes.reduce((acc, alumno) => {
            if (!acc[alumno.seccion]) acc[alumno.seccion] = [];
            acc[alumno.seccion].push({ ...alumno, hora: obtenerHoraLlegada(alumno, asistencias, fechaReal) });
            return acc;
        }, {});
        const faltantesPorSeccion = alumnosFaltantes.reduce((acc, alumno) => {
            if (!acc[alumno.seccion]) acc[alumno.seccion] = [];
            acc[alumno.seccion].push(alumno);
            return acc;
        }, {});
        // Guardar en window para paginación
        window._presentesPorSeccion = presentesPorSeccion;
        window._faltantesPorSeccion = faltantesPorSeccion;
        // Crear el HTML para la vista previa
        let html = `
            <div class="attendance-preview-modal">
                <div class="preview-content">
                    <h3>Detalles de Asistencia - ${fechaReal.toLocaleDateString('es-ES')}</h3>
                    <p>Total de registros: ${asistencias.length}</p>
                    <div class="attendance-summary">
                        <div class="summary-item present">
                            <h4>Presentes: ${alumnosPresentes.length}</h4>
                        </div>
                        <div class="summary-item absent">
                            <h4>Faltantes: ${alumnosFaltantes.length}</h4>
                        </div>
                    </div>
                    <div class="preview-sections">
                        <div class="section-group">
                            <h3>Alumnos Presentes</h3>
                            ${renderAlumnosPorSeccionConPaginacion(presentesPorSeccion, 'presentes')}
                        </div>
                        <div class="section-group">
                            <h3>Alumnos Faltantes</h3>
                            ${renderAlumnosPorSeccionConPaginacion(faltantesPorSeccion, 'faltantes')}
                        </div>
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()">Cerrar</button>
                </div>
            </div>
        `;
        // Agregar el modal al body
        const modal = document.createElement('div');
        modal.innerHTML = html;
        document.body.appendChild(modal.firstElementChild);
    } catch (error) {
        console.error('Error al mostrar vista previa:', error);
        alert('Error al cargar los detalles de asistencia');
    }
}

// Filtrar asistencias por fecha
function filterAttendance() {
    const date = document.getElementById('filterDate').value;
    console.log('\n=== Filtrando asistencias ===');
    console.log('Fecha seleccionada para filtrar:', date);
    
    const cards = document.querySelectorAll('.attendance-card');
    console.log('Total de tarjetas encontradas:', cards.length);
    
    cards.forEach(card => {
        const cardDate = card.dataset.date;
        console.log('Verificando tarjeta:', {
            cardDate,
            fechaFiltro: date,
            coincide: !date || cardDate === date
        });
        
        if (!date || cardDate === date) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// Seleccionar todas las asistencias
function selectAllAttendance() {
    console.log('\n=== Seleccionando todas las asistencias ===');
    const cards = document.querySelectorAll('.attendance-card');
    console.log('Total de tarjetas a seleccionar:', cards.length);
    
    cards.forEach(card => {
        const date = card.dataset.date;
        console.log('Seleccionando fecha:', date);
        selectedAttendanceFiles.add(date);
        card.querySelector('input[type="checkbox"]').checked = true;
    });
    
    console.log('Fechas seleccionadas:', Array.from(selectedAttendanceFiles));
}

// Deseleccionar todas las asistencias
function deselectAllAttendance() {
    console.log('\n=== Deseleccionando todas las asistencias ===');
    const cards = document.querySelectorAll('.attendance-card');
    console.log('Total de tarjetas a deseleccionar:', cards.length);
    
    cards.forEach(card => {
        const date = card.dataset.date;
        console.log('Deseleccionando fecha:', date);
        selectedAttendanceFiles.delete(date);
        card.querySelector('input[type="checkbox"]').checked = false;
    });
    
    console.log('Fechas seleccionadas:', Array.from(selectedAttendanceFiles));
}

// Alternar selección de asistencia
function toggleAttendanceSelection(date) {
    console.log('\n=== Alternando selección de asistencia ===');
    console.log('Fecha a alternar:', date);
    console.log('Estado actual:', selectedAttendanceFiles.has(date));
    
    if (selectedAttendanceFiles.has(date)) {
        selectedAttendanceFiles.delete(date);
        console.log('Fecha deseleccionada');
    } else {
        selectedAttendanceFiles.add(date);
        console.log('Fecha seleccionada');
    }
    
    console.log('Fechas seleccionadas:', Array.from(selectedAttendanceFiles));
}

// Procesar archivo Excel
async function processExcel() {
    const select = document.getElementById('excelFileSelect');
    const fileName = select.value;
    
    if (!fileName) {
        alert('Por favor, selecciona un archivo Excel');
        return;
    }

    try {
        const response = await fetch(`/uploads/${fileName}`);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Procesar cada hoja del libro
        alumnosData = [];
        workbook.SheetNames.forEach(sheetName => {
            // Extraer grado y sección del nombre de la hoja
            const gradoMatch = sheetName.match(/\d+/);
            const seccionMatch = sheetName.match(/[A-F]$/);
            
            if (gradoMatch && seccionMatch) {
                const grado = parseInt(gradoMatch[0]);
                const seccion = seccionMatch[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                // Procesar filas (empezando desde la fila 4 para saltar encabezados)
                for (let i = 4; i < 34; i++) {
                    if (!jsonData[i] || !jsonData[i][0]) continue;

                    const numero = parseInt(jsonData[i][0]);
                    const nombre = jsonData[i][2] || '';
                    const celular = jsonData[i][6] || '';

                    if (!isNaN(numero) && nombre && nombre.toLowerCase() !== 'nombre completo') {
                        alumnosData.push({
                            numero,
                            nombre,
                            celular: celular.toString().replace(/\D/g, ''),
                            seccion: `${grado}${seccion}`
                        });
                    }
                }
            }
        });

        // Ordenar por número
        alumnosData.sort((a, b) => a.numero - b.numero);

        // Guardar en localStorage
        localStorage.setItem('alumnosData', JSON.stringify(alumnosData));
        
        // Mostrar datos
        displayExcelData();
    } catch (error) {
        console.error('Error al procesar Excel:', error);
        alert('Error al procesar el archivo Excel');
    }
}

// Procesar archivo .dat del huellero
async function processDat() {
    const select = document.getElementById('datFileSelect');
    const fileName = select.value;
    
    if (!fileName) {
        alert('Por favor, selecciona un archivo .dat');
        return;
    }

    try {
        const response = await fetch(`/uploads/${fileName}`);
        const content = await response.text();
        asistenciasData = processDatFile(content);
        
        // Guardar en localStorage
        localStorage.setItem('asistenciasData', JSON.stringify(asistenciasData));
        
        // Mostrar datos
        displayAttendanceData();
    } catch (error) {
        console.error('Error al procesar archivo .dat:', error);
        alert('Error al procesar el archivo .dat');
    }
}

// Función para procesar el archivo .dat
function processDatFile(content) {
    const lines = content.split('\n');
    const asistencias = [];
    
    lines.forEach(line => {
        if (line.trim()) {
            // El formato es: numero fecha hora estado1 estado2 estado3 estado4
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const numero = parseInt(parts[0]);
                const fechaHora = parts[1].trim();
                
                if (!isNaN(numero)) {
                    asistencias.push({
                        numero: numero,
                        presente: true,
                        fechaHora: fechaHora
                    });
                }
            }
        }
    });
    
    return asistencias;
}

// Función para abrir la vista previa de la lista de alumnos
function abrirExcelPreview() {
    document.getElementById('excelPreviewBox').style.display = 'block';
    displayExcelData();
}

// Función para cerrar la vista previa de la lista de alumnos
function cerrarExcelPreview() {
    document.getElementById('excelPreviewBox').style.display = 'none';
}

// Modificar displayExcelData para limitar la altura a 10 filas y permitir scroll
function displayExcelData() {
    const container = document.getElementById('excelData');
    if (!alumnosData.length) {
        container.innerHTML = '<p>No hay datos de alumnos disponibles</p>';
        return;
    }
    // Agrupar por sección
    const alumnosPorSeccion = alumnosData.reduce((acc, alumno) => {
        if (!acc[alumno.seccion]) {
            acc[alumno.seccion] = [];
        }
        acc[alumno.seccion].push(alumno);
        return acc;
    }, {});
    let html = '';
    Object.entries(alumnosPorSeccion).forEach(([seccion, alumnos]) => {
        html += `
            <div class="seccion-grupo">
                <h4>Sección ${seccion}</h4>
                <div class="excel-preview-table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Número</th>
                            <th>Nombre</th>
                            <th>Celular</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${alumnos.map(alumno => `
                            <tr>
                                <td>${alumno.numero}</td>
                                <td>${alumno.nombre}</td>
                                <td>${alumno.celular}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Mostrar datos de asistencia
function displayAttendanceData() {
    const container = document.getElementById('attendanceData');
    if (!asistenciasData.length) {
        container.innerHTML = '<p>No hay datos de asistencia disponibles</p>';
        return;
    }

    // Obtener todos los números de alumnos
    const todosLosNumeros = alumnosData.map(a => a.numero);
    
    // Encontrar los faltantes
    const faltantes = todosLosNumeros.filter(numero => 
        !asistenciasData.some(a => a.numero === numero)
    ).map(numero => ({
        numero: numero,
        alumno: alumnosData.find(a => a.numero === numero)
    }));
    
    // Agrupar faltantes por sección
    const faltantesPorSeccion = faltantes.reduce((acc, falta) => {
        if (!acc[falta.alumno.seccion]) {
            acc[falta.alumno.seccion] = [];
        }
        acc[falta.alumno.seccion].push(falta);
        return acc;
    }, {});

    let html = '<h4>Alumnos Faltantes:</h4>';
    Object.entries(faltantesPorSeccion).forEach(([seccion, faltantes]) => {
        html += `
            <div class="seccion-grupo">
                <h5>Sección ${seccion}</h5>
                <table>
                    <thead>
                        <tr>
                            <th>Número</th>
                            <th>Nombre</th>
                            <th>Celular</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${faltantes.map(falta => `
                            <tr>
                                <td>${falta.numero}</td>
                                <td>${falta.alumno ? falta.alumno.nombre : 'No encontrado'}</td>
                                <td>${falta.alumno ? falta.alumno.celular : 'No encontrado'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    container.innerHTML = html;
}



function formatearNumero(numero) {
    return numero.startsWith('51') ? numero : '51' + numero;
}

async function sendWhatsAppNotifications() {
    console.log('\n=== Enviando notificaciones ===');
    console.log('Fechas seleccionadas:', Array.from(selectedAttendanceFiles));

    if (selectedAttendanceFiles.size === 0) {
        alert('Por favor, selecciona al menos una fecha para enviar notificaciones');
        return;
    }

    const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
    console.log('Asistencias guardadas:', asistenciasGuardadas);

    let totalEnviados = 0;
    let totalErrores = 0;

    const ausenciasPorAlumno = {};

    for (const fecha of selectedAttendanceFiles) {
        console.log('\nProcesando fecha:', fecha);
        const data = asistenciasGuardadas[fecha];
        if (!data) {
            console.log('No hay datos para esta fecha');
            continue;
        }

        const alumnosFaltantes = alumnosData.filter(alumno =>
            determinarFalta(alumno, data.asistencias, fecha) && alumno.celular
        );

        console.log('Alumnos faltantes encontrados:', alumnosFaltantes.length);

        for (const alumno of alumnosFaltantes) {
            const id = alumno.nombre + '_' + alumno.celular;
            if (!ausenciasPorAlumno[id]) {
                ausenciasPorAlumno[id] = {
                    alumno: alumno,
                    fechas: []
                };
            }
            ausenciasPorAlumno[id].fechas.push(new Date(fecha));
        }
    }

    for (const id in ausenciasPorAlumno) {
        const { alumno, fechas } = ausenciasPorAlumno[id];
        const fechaFormateada = fechas
    .sort((a, b) => a - b)
    .map(f => {
        const fechaAjustada = new Date(f.getTime() + 24 * 60 * 60 * 1000); // sumar 1 día
        return fechaAjustada.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    });


        const plantilla = fechas.length > 1 ? 'alertafaltasvarias' : 'alerta_faltas';

        const parametros = [
            { type: "text", text: alumno.nombre },
            { type: "text", text: fechas.length > 1 ? fechaFormateada.join(', ') : fechaFormateada[0] }
        ];

        console.log(`Enviando plantilla "${plantilla}" a:`, {
            alumno: alumno.nombre,
            celular: alumno.celular,
            fechas: fechaFormateada
        });

        try {
            const response = await fetch(`https://graph.facebook.com/v17.0/${WSP_PHONE_ID}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WSP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: formatearNumero(alumno.celular),
                    type: "template",
                    template: {
                        name: plantilla,
                        language: {
                            code: "es"
                        },
                        components: [
                            {
                                type: "body",
                                parameters: parametros
                            }
                        ]
                    }
                })
            });

            const result = await response.json();
            console.log('Respuesta de WhatsApp API:', result);

            if (!response.ok || result.error) {
                console.error(`Error al enviar mensaje a ${alumno.nombre}:`, result.error || result);
                totalErrores++;
            } else {
                console.log('Mensaje enviado exitosamente');
                totalEnviados++;
            }
        } catch (error) {
            console.error(`Error al enviar mensaje a ${alumno.nombre}:`, error);
            totalErrores++;
        }
    }

    console.log('Resumen de envío:', {
        totalEnviados,
        totalErrores
    });

    alert(`Notificaciones enviadas:\n- Enviados: ${totalEnviados}\n- Errores: ${totalErrores}`);
}



// Cargar datos guardados al iniciar
window.onload = function() {
    loadAvailableFiles();
    loadAttendanceFiles();
    
    const savedAlumnos = localStorage.getItem('alumnosData');
    if (savedAlumnos) {
        alumnosData = JSON.parse(savedAlumnos);
        displayExcelData();
    }
};

// Limpiar historial de asistencias
function limpiarHistorialAsistencias() {
    if (confirm('¿Estás seguro de que deseas limpiar el historial de asistencias? Esta acción no se puede deshacer.')) {
        const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
        localStorage.removeItem('asistenciasData');
        alert('Historial de asistencias limpiado correctamente');
        location.reload();
    }
}

// Modificar recargarListas para abrir automáticamente la vista previa
async function recargarListas() {
    try {
        // Limpiar localStorage primero
        localStorage.removeItem('asistenciasData');
        localStorage.removeItem('alumnosData');

        // Limpiar las listas actuales
        document.getElementById('excelFileSelect').innerHTML = '<option value="">Seleccione un archivo Excel</option>';
        document.getElementById('attendanceData').innerHTML = '';
        document.getElementById('excelData').innerHTML = '';
        document.getElementById('excelPreviewBox').style.display = 'none';

        // Recargar archivos disponibles desde el backend
        const response = await fetch('/uploads');
        const files = await response.json();

        // Procesar archivos Excel
        const excelFiles = files.filter(file => file.endsWith('.xlsx') || file.endsWith('.xls'));
        const excelSelect = document.getElementById('excelFileSelect');

        excelFiles.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            excelSelect.appendChild(option);
        });

        // Si hay archivos Excel, procesar el primero automáticamente
        if (excelFiles.length > 0) {
            excelSelect.value = excelFiles[0];
            await processExcel();
            // Abrir automáticamente la vista previa
            document.getElementById('excelPreviewBox').style.display = 'block';
        }

        // Procesar archivos .dat
        const datFiles = files.filter(file => file.endsWith('.dat'));
        for (const file of datFiles) {
            try {
                const response = await fetch(`/uploads/${file}`);
                const content = await response.text();
                const asistencias = processDatFile(content);

                if (asistencias.length > 0) {
                    // Obtener la fecha del primer registro
                    const primeraAsistencia = asistencias[0];
                    const [fecha, hora] = primeraAsistencia.fechaHora.split(' ');
                    const [year, month, day] = fecha.split('-').map(Number);
                    const fechaClave = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                    // Guardar en localStorage
                    const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
                    asistenciasGuardadas[fechaClave] = {
                        filename: file,
                        asistencias: asistencias,
                        count: asistencias.length
                    };
                    localStorage.setItem('asistenciasData', JSON.stringify(asistenciasGuardadas));
                }
            } catch (error) {
                console.error(`Error al procesar archivo ${file}:`, error);
            }
        }

        // Recargar la vista de asistencias
        await loadAttendanceFiles();

        alert('Listas recargadas correctamente');
    } catch (error) {
        console.error('Error al recargar listas:', error);
        alert('Error al recargar las listas');
    }
}

// Limpiar historial entero
function limpiarHistorialEntero() {
    if (confirm('¿Estás seguro de que deseas limpiar todo el historial? Esta acción eliminará todos los datos guardados y no se puede deshacer.')) {
        localStorage.clear();
        alert('Historial completo limpiado correctamente');
        location.reload();
    }
} 