// Almacenamiento de datos
let alumnosData = [];
let asistenciasData = [];
let selectedAttendanceFiles = new Set();

// Variable global para almacenar las secciones seleccionadas
let seccionesSeleccionadas = new Set();

// Configuración de WhatsApp
const WSP_TOKEN = 'EAAUJUvz0VZBEBPJUnxY035Gj80Ydv6KnV48c1O8awAi0KIUcyKhZA3HqGgNjrO8dWSbmWdfk70HPyGnpBLaNsoDuPAh2iyYSosYdxvou3QF3Vc2ZB8pO3v350OjzPPqC9z0MHavoNMxQIOeBjsYjJhxlrwuYN5Ey39vsj0k42da2eOlYSpSq7pjhY3zlGdtAdkyf1nnOZC7GfSdGzftVro9C97rNJ9w4e3mF06uKHZAJRiT2aFB8TG7UFV76GJQZDZD';
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

    // Verificar si hay secciones seleccionadas
    if (seccionesSeleccionadas.size === 0) {
        alert('Por favor, selecciona al menos una sección para procesar');
        return;
    }

    try {
        console.log('\n=== PROCESANDO ARCHIVO .DAT ===');
        console.log('1. Secciones seleccionadas:', Array.from(seccionesSeleccionadas));
        console.log('2. Cargando archivos Excel de las secciones seleccionadas...');
        
        // Cargar todos los archivos Excel disponibles
        const response = await fetch('/uploads');
        const files = await response.json();
        const excelFiles = files.filter(file => file.endsWith('.xlsx') || file.endsWith('.xls'));
        
        console.log('3. Archivos Excel encontrados:', excelFiles);
        
        // Procesar solo los archivos Excel de las secciones seleccionadas
        let todosLosAlumnos = [];
        
        for (const excelFile of excelFiles) {
            console.log(`4. Procesando archivo Excel: ${excelFile}`);
            
            try {
                const excelResponse = await fetch(`/uploads/${excelFile}`);
                const arrayBuffer = await excelResponse.arrayBuffer();
                const data = new Uint8Array(arrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                
                workbook.SheetNames.forEach(sheetName => {
                    console.log(`   - Procesando hoja: ${sheetName}`);
                    
                    // Extraer grado y sección del nombre de la hoja
                    const gradoMatch = sheetName.match(/\d+/);
                    const seccionMatch = sheetName.match(/[A-F]$/);
                    
                    let grado = null;
                    let seccion = null;
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (gradoMatch && seccionMatch) {
                        // Si coincide con el patrón del nombre de la hoja
                        grado = parseInt(gradoMatch[0]);
                        seccion = seccionMatch[0];
                        console.log(`     ✓ Grado y sección extraídos del nombre: ${grado}${seccion}`);
                    } else {
                        // Buscar en la celda A3 (fila 2, columna 0)
                        if (jsonData.length > 2 && jsonData[2] && jsonData[2][0]) {
                            const celdaA3 = jsonData[2][0];
                            console.log(`     - Contenido de celda A3: "${celdaA3}"`);
                            
                            // Buscar patrón como "GRADO: 2° D" o "GRADO: 2 D" o "GRADO: 2°D"
                            const patronGrado = celdaA3.match(/GRADO:\s*(\d+)[°º]?\s*([A-F])/i);
                            if (patronGrado) {
                                grado = parseInt(patronGrado[1]);
                                seccion = patronGrado[2].toUpperCase();
                                console.log(`     ✓ Grado y sección encontrados en A3: ${grado}${seccion}`);
                            } else {
                                console.log(`     ✗ No se encontró el patrón en A3, usando valores por defecto`);
                                grado = 1;
                                seccion = 'A';
                            }
                        } else {
                            console.log(`     ✗ Celda A3 no encontrada, usando valores por defecto`);
                            grado = 1;
                            seccion = 'A';
                        }
                    }

                    // Solo procesar si la sección está seleccionada
                    const seccionCompleta = `${grado}${seccion}`;
                    if (!seccionesSeleccionadas.has(seccionCompleta)) {
                        console.log(`     ⏭️ Sección ${seccionCompleta} no seleccionada, saltando...`);
                        return;
                    }

                    console.log(`     ✅ Procesando sección ${seccionCompleta} (seleccionada)`);

                    // Procesar filas (empezando desde la fila 4 para saltar encabezados)
                    let alumnosEncontrados = 0;
                    for (let i = 4; i < 34; i++) {
                        if (!jsonData[i] || !jsonData[i][0]) continue;

                        const numero = parseInt(jsonData[i][0]);
                        const nombre = jsonData[i][2] || '';
                        const celular = jsonData[i][6] || '';

                        if (!isNaN(numero) && nombre && nombre.toLowerCase() !== 'nombre completo') {
                            const alumno = {
                                numero,
                                nombre,
                                celular: celular.toString().replace(/\D/g, ''),
                                seccion: seccionCompleta,
                                archivoOrigen: excelFile
                            };
                            todosLosAlumnos.push(alumno);
                            alumnosEncontrados++;
                        }
                    }
                    
                    console.log(`     - Alumnos encontrados en ${sheetName}: ${alumnosEncontrados}`);
                });
                
            } catch (error) {
                console.error(`Error al procesar archivo ${excelFile}:`, error);
            }
        }
        
        console.log('5. Total de alumnos cargados de las secciones seleccionadas:', todosLosAlumnos.length);
        console.log('6. Alumnos por sección:', todosLosAlumnos.reduce((acc, alumno) => {
            acc[alumno.seccion] = (acc[alumno.seccion] || 0) + 1;
            return acc;
        }, {}));
        
        // Actualizar la variable global alumnosData con solo los alumnos de las secciones seleccionadas
        alumnosData = todosLosAlumnos;
        localStorage.setItem('alumnosData', JSON.stringify(alumnosData));
        
        // Leer el contenido del archivo .dat
        console.log('7. Procesando archivo .dat...');
        const content = await file.text();
        const todasLasAsistencias = processDatFile(content);
        
        // Filtrar solo las asistencias del día seleccionado
        const [year, month, day] = dateInput.value.split('-').map(Number);
        const fechaSeleccionada = new Date(year, month - 1, day);
        
        const nuevasAsistencias = todasLasAsistencias.filter(asistencia => {
            const [fecha, hora] = asistencia.fechaHora.split(' ');
            const [year, month, day] = fecha.split('-').map(Number);
            const fechaAsistencia = new Date(year, month - 1, day);
            
            // Comparar año, mes y día por separado
            const mismoAño = fechaAsistencia.getFullYear() === fechaSeleccionada.getFullYear();
            const mismoMes = fechaAsistencia.getMonth() === fechaSeleccionada.getMonth();
            const mismoDia = fechaAsistencia.getDate() === fechaSeleccionada.getDate();
            
            return mismoAño && mismoMes && mismoDia;
        });
        
        console.log('8. Resumen de procesamiento:', {
            fechaSeleccionada: fechaSeleccionada.toISOString(),
            totalRegistros: todasLasAsistencias.length,
            registrosFiltrados: nuevasAsistencias.length,
            totalAlumnosDisponibles: alumnosData.length,
            seccionesProcesadas: Array.from(seccionesSeleccionadas)
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
        
        alert(`Archivo procesado correctamente.\nTotal de registros en el archivo: ${todasLasAsistencias.length}\nRegistros del día ${dateInput.value}: ${nuevasAsistencias.length}\nTotal de alumnos disponibles: ${alumnosData.length}\nSecciones procesadas: ${Array.from(seccionesSeleccionadas).join(', ')}`);
        
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
    console.log('2. Alumno a verificar:', alumno);
    console.log('3. Total de asistencias disponibles:', asistencias.length);
    
    const turno = getTurno(alumno.seccion);
    console.log('4. Turno del alumno:', turno);
    
    // Crear fecha de asistencia de manera consistente
    let fechaAsistencia;
    if (fecha instanceof Date) {
        fechaAsistencia = fecha;
    } else if (typeof fecha === 'string') {
        // Si es string "YYYY-MM-DD", crear fecha local
        const [year, month, day] = fecha.split('-').map(Number);
        fechaAsistencia = new Date(year, month - 1, day);
    } else {
        fechaAsistencia = new Date(fecha);
    }
    
    console.log('5. Fecha convertida a objeto Date:', fechaAsistencia);
    console.log('6. Fecha en formato ISO:', fechaAsistencia.toISOString());
    
    // Filtrar asistencias por fecha usando comparación de componentes
    const asistenciasDelDia = asistencias.filter(a => {
        const [fecha, hora] = a.fechaHora.split(' ');
        const [year, month, day] = fecha.split('-').map(Number);
        const fechaRegistro = new Date(year, month - 1, day);
        
        console.log('7. Comparando fechas:', {
            fechaAsistencia: fechaAsistencia.toISOString(),
            fechaRegistro: fechaRegistro.toISOString(),
            fechaHoraOriginal: a.fechaHora,
            añoSeleccionado: fechaAsistencia.getFullYear(),
            mesSeleccionado: fechaAsistencia.getMonth(),
            diaSeleccionado: fechaAsistencia.getDate(),
            añoAsistencia: fechaRegistro.getFullYear(),
            mesAsistencia: fechaRegistro.getMonth(),
            diaAsistencia: fechaRegistro.getDate()
        });
        
        // Comparar usando componentes de fecha para evitar problemas de zona horaria
        return fechaRegistro.getFullYear() === fechaAsistencia.getFullYear() &&
               fechaRegistro.getMonth() === fechaAsistencia.getMonth() &&
               fechaRegistro.getDate() === fechaAsistencia.getDate();
    });
    
    console.log('8. Asistencias del día encontradas:', asistenciasDelDia.length);
    console.log('9. Números de asistencias del día:', asistenciasDelDia.map(a => a.numero));
    console.log('10. Número del alumno a buscar:', alumno.numero);
    
    const falta = !asistenciasDelDia.some(a => a.numero === alumno.numero);
    console.log('11. ¿El alumno falta?', falta);
    
    return falta;
}

// Función para obtener la hora de llegada de un alumno
function obtenerHoraLlegada(alumno, asistencias, fecha) {
    const turno = getTurno(alumno.seccion);
    
    // Crear fecha de asistencia de manera consistente
    let fechaAsistencia;
    if (fecha instanceof Date) {
        fechaAsistencia = fecha;
    } else if (typeof fecha === 'string') {
        // Si es string "YYYY-MM-DD", crear fecha local
        const [year, month, day] = fecha.split('-').map(Number);
        fechaAsistencia = new Date(year, month - 1, day);
    } else {
        fechaAsistencia = new Date(fecha);
    }
    
    // Filtrar asistencias por fecha usando comparación de componentes
    const asistenciasDelDia = asistencias.filter(a => {
        const fechaRegistro = new Date(a.fechaHora);
        return fechaRegistro.getFullYear() === fechaAsistencia.getFullYear() &&
               fechaRegistro.getMonth() === fechaAsistencia.getMonth() &&
               fechaRegistro.getDate() === fechaAsistencia.getDate();
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

    console.log('\n=== PROCESANDO ARCHIVO EXCEL ===');
    console.log('1. Archivo seleccionado:', fileName);

    try {
        const response = await fetch(`/uploads/${fileName}`);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        console.log('2. Hojas encontradas en el archivo:', workbook.SheetNames);
        
        // Procesar cada hoja del libro
        alumnosData = [];
        workbook.SheetNames.forEach(sheetName => {
            console.log(`\n3. Procesando hoja: ${sheetName}`);
            
            // Extraer grado y sección del nombre de la hoja
            const gradoMatch = sheetName.match(/\d+/);
            const seccionMatch = sheetName.match(/[A-F]$/);
            
            console.log('4. Extracción de grado y sección:', {
                gradoMatch: gradoMatch ? gradoMatch[0] : 'No encontrado',
                seccionMatch: seccionMatch ? seccionMatch[0] : 'No encontrado'
            });
            
            let grado = null;
            let seccion = null;
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            console.log('5. Datos de la hoja:', {
                totalFilas: jsonData.length,
                primerasFilas: jsonData.slice(0, 5)
            });

            if (gradoMatch && seccionMatch) {
                // Si coincide con el patrón del nombre de la hoja
                grado = parseInt(gradoMatch[0]);
                seccion = seccionMatch[0];
                console.log('6. Grado y sección extraídos del nombre de la hoja:', { grado, seccion });
            } else {
                // Buscar en la celda A3 (fila 2, columna 0)
                console.log('6. Buscando grado y sección en la celda A3...');
                if (jsonData.length > 2 && jsonData[2] && jsonData[2][0]) {
                    const celdaA3 = jsonData[2][0];
                    console.log('   - Contenido de celda A3:', `"${celdaA3}"`);
                    
                    // Buscar patrón como "GRADO: 2° D" o "GRADO: 2 D" o "GRADO: 2°D"
                    const patronGrado = celdaA3.match(/GRADO:\s*(\d+)[°º]?\s*([A-F])/i);
                    if (patronGrado) {
                        grado = parseInt(patronGrado[1]);
                        seccion = patronGrado[2].toUpperCase();
                        console.log(`   ✓ Grado y sección encontrados en A3: Grado ${grado}, Sección ${seccion}`);
                    } else {
                        console.log('   ✗ No se encontró el patrón esperado en A3');
                        // Usar valores por defecto
                        grado = 1;
                        seccion = 'A';
                        console.log('   - Usando valores por defecto:', { grado, seccion });
                    }
                } else {
                    console.log('   ✗ Celda A3 no encontrada o vacía');
                    // Usar valores por defecto
                    grado = 1;
                    seccion = 'A';
                    console.log('   - Usando valores por defecto:', { grado, seccion });
                }
            }

            // Procesar filas (empezando desde la fila 4 para saltar encabezados)
            let alumnosEncontrados = 0;
            console.log('7. Procesando filas de datos (filas 4-34):');
            
            for (let i = 4; i < 34; i++) {
                if (!jsonData[i] || !jsonData[i][0]) {
                    console.log(`   Fila ${i}: Vacía o sin datos`);
                    continue;
                }

                // Mostrar información de la fila actual
                console.log(`   Fila ${i}: [${jsonData[i].slice(0, 8).map((val, idx) => `Col${idx}:"${val}"`).join(', ')}]`);

                const numero = parseInt(jsonData[i][0]);
                const nombre = jsonData[i][2] || '';
                const celular = jsonData[i][6] || '';

                console.log(`   - Columna 0 (Número): "${jsonData[i][0]}" -> ${numero}`);
                console.log(`   - Columna 2 (Nombre): "${jsonData[i][2]}" -> "${nombre}"`);
                console.log(`   - Columna 6 (Celular): "${jsonData[i][6]}" -> "${celular}"`);

                if (!isNaN(numero) && nombre && nombre.toLowerCase() !== 'nombre completo') {
                    const alumno = {
                        numero,
                        nombre,
                        celular: celular.toString().replace(/\D/g, ''),
                        seccion: `${grado}${seccion}`
                    };
                    alumnosData.push(alumno);
                    alumnosEncontrados++;
                    console.log(`   ✓ Alumno agregado:`, alumno);
                } else {
                    console.log(`   ✗ Fila ${i} ignorada - datos inválidos`);
                }
            }
            
            console.log(`8. Total de alumnos encontrados en ${sheetName}: ${alumnosEncontrados}`);
        });

        // Ordenar por número
        alumnosData.sort((a, b) => a.numero - b.numero);

        console.log('\n9. Resumen final:', {
            totalAlumnos: alumnosData.length,
            alumnosPorSeccion: alumnosData.reduce((acc, alumno) => {
                acc[alumno.seccion] = (acc[alumno.seccion] || 0) + 1;
                return acc;
            }, {})
        });

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
    console.log('\n=== PROCESANDO ARCHIVO .DAT ===');
    console.log('1. Contenido del archivo (primeras 5 líneas):', content.split('\n').slice(0, 5));
    
    const lines = content.split('\n');
    const asistencias = [];
    
    console.log('2. Total de líneas en el archivo:', lines.length);
    
    lines.forEach((line, index) => {
        if (line.trim()) {
            console.log(`3. Procesando línea ${index + 1}:`, line);
            
            // El formato es: numero fecha hora estado1 estado2 estado3 estado4
            const parts = line.split('\t');
            console.log(`4. Partes de la línea ${index + 1}:`, parts);
            
            if (parts.length >= 2) {
                const numero = parseInt(parts[0]);
                const fechaHora = parts[1].trim();
                
                console.log(`5. Datos extraídos de línea ${index + 1}:`, {
                    numero: numero,
                    fechaHora: fechaHora,
                    esNumeroValido: !isNaN(numero)
                });
                
                if (!isNaN(numero)) {
                    const asistencia = {
                        numero: numero,
                        presente: true,
                        fechaHora: fechaHora
                    };
                    asistencias.push(asistencia);
                    console.log(`6. Asistencia agregada:`, asistencia);
                } else {
                    console.log(`6. Línea ${index + 1} ignorada - número no válido`);
                }
            } else {
                console.log(`4. Línea ${index + 1} ignorada - formato incorrecto`);
            }
        }
    });
    
    console.log('\n7. Resumen del procesamiento .dat:', {
        totalAsistencias: asistencias.length,
        primerosRegistros: asistencias.slice(0, 5)
    });
    
    return asistencias;
}

// Función para cargar y mostrar las secciones disponibles
async function cargarSeccionesDisponibles() {
    console.log('\n=== CARGANDO SECCIONES DISPONIBLES ===');
    
    try {
        const response = await fetch('/uploads');
        const files = await response.json();
        const excelFiles = files.filter(file => file.endsWith('.xlsx') || file.endsWith('.xls'));
        
        console.log('1. Archivos Excel encontrados:', excelFiles);
        
        const seccionesUnicas = new Set();
        
        // Procesar cada archivo Excel para obtener las secciones
        for (const excelFile of excelFiles) {
            try {
                const excelResponse = await fetch(`/uploads/${excelFile}`);
                const arrayBuffer = await excelResponse.arrayBuffer();
                const data = new Uint8Array(arrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                
                workbook.SheetNames.forEach(sheetName => {
                    // Extraer grado y sección del nombre de la hoja
                    const gradoMatch = sheetName.match(/\d+/);
                    const seccionMatch = sheetName.match(/[A-F]$/);
                    
                    let grado = null;
                    let seccion = null;
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (gradoMatch && seccionMatch) {
                        grado = parseInt(gradoMatch[0]);
                        seccion = seccionMatch[0];
                    } else {
                        // Buscar en la celda A3
                        if (jsonData.length > 2 && jsonData[2] && jsonData[2][0]) {
                            const celdaA3 = jsonData[2][0];
                            const patronGrado = celdaA3.match(/GRADO:\s*(\d+)[°º]?\s*([A-F])/i);
                            if (patronGrado) {
                                grado = parseInt(patronGrado[1]);
                                seccion = patronGrado[2].toUpperCase();
                            }
                        }
                    }
                    
                    if (grado && seccion) {
                        seccionesUnicas.add(`${grado}${seccion}`);
                    }
                });
                
            } catch (error) {
                console.error(`Error al procesar archivo ${excelFile}:`, error);
            }
        }
        
        console.log('2. Secciones únicas encontradas:', Array.from(seccionesUnicas));
        
        // Mostrar el selector de secciones
        mostrarSelectorSecciones(Array.from(seccionesUnicas).sort());
        
    } catch (error) {
        console.error('Error al cargar secciones:', error);
    }
}

// Función para mostrar el selector de secciones
function mostrarSelectorSecciones(secciones) {
    const selector = document.getElementById('seccionSelector');
    const contenedor = document.getElementById('seccionesDisponibles');
    
    if (secciones.length === 0) {
        selector.style.display = 'none';
        return;
    }
    
    // Crear checkboxes para cada sección
    contenedor.innerHTML = secciones.map(seccion => `
        <label style="display: flex; align-items: center; padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; cursor: pointer;">
            <input type="checkbox" value="${seccion}" onchange="toggleSeccion('${seccion}')" style="margin-right: 8px;">
            <span style="font-weight: bold;">${seccion}</span>
        </label>
    `).join('');
    
    selector.style.display = 'block';
    actualizarResumenSecciones();
}

// Función para alternar la selección de una sección
function toggleSeccion(seccion) {
    if (seccionesSeleccionadas.has(seccion)) {
        seccionesSeleccionadas.delete(seccion);
    } else {
        seccionesSeleccionadas.add(seccion);
    }
    actualizarResumenSecciones();
}

// Función para seleccionar todas las secciones
function seleccionarTodasSecciones() {
    const checkboxes = document.querySelectorAll('#seccionesDisponibles input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        seccionesSeleccionadas.add(checkbox.value);
    });
    actualizarResumenSecciones();
}

// Función para deseleccionar todas las secciones
function deseleccionarTodasSecciones() {
    const checkboxes = document.querySelectorAll('#seccionesDisponibles input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        seccionesSeleccionadas.delete(checkbox.value);
    });
    actualizarResumenSecciones();
}

// Función para actualizar el resumen de secciones seleccionadas
function actualizarResumenSecciones() {
    const resumen = document.getElementById('seccionesSeleccionadas');
    if (seccionesSeleccionadas.size === 0) {
        resumen.textContent = 'Ninguna';
    } else {
        resumen.textContent = Array.from(seccionesSeleccionadas).sort().join(', ');
    }
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
    console.log('\n=== MOSTRANDO DATOS DE EXCEL ===');
    console.log('1. Estado de alumnosData:', {
        longitud: alumnosData.length,
        primerosAlumnos: alumnosData.slice(0, 3)
    });
    
    const container = document.getElementById('excelData');
    if (!alumnosData.length) {
        console.log('2. No hay datos de alumnos disponibles');
        container.innerHTML = '<p>No hay datos de alumnos disponibles</p>';
        return;
    }
    
    console.log('3. Procesando datos de alumnos...');
    
    // Agrupar por sección
    const alumnosPorSeccion = alumnosData.reduce((acc, alumno) => {
        if (!acc[alumno.seccion]) {
            acc[alumno.seccion] = [];
        }
        acc[alumno.seccion].push(alumno);
        return acc;
    }, {});
    
    console.log('4. Alumnos agrupados por sección:', alumnosPorSeccion);
    
    let html = '';
    Object.entries(alumnosPorSeccion).forEach(([seccion, alumnos]) => {
        console.log(`5. Procesando sección ${seccion} con ${alumnos.length} alumnos`);
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
    
    console.log('6. HTML generado y aplicado al contenedor');
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

// Función para calcular y mostrar el resumen de mensajes antes del envío
async function calcularResumenMensajes() {
    console.log('\n=== CALCULANDO RESUMEN DE MENSAJES ===');
    console.log('Fechas seleccionadas:', Array.from(selectedAttendanceFiles));

    if (selectedAttendanceFiles.size === 0) {
        alert('Por favor, selecciona al menos una fecha para enviar notificaciones');
        return;
    }

    const asistenciasGuardadas = JSON.parse(localStorage.getItem('asistenciasData') || '{}');
    console.log('Asistencias guardadas:', asistenciasGuardadas);

    const ausenciasPorAlumno = {};
    let totalMensajes = 0;
    let alumnosConCelular = 0;
    let alumnosSinCelular = 0;

    for (const fecha of selectedAttendanceFiles) {
        console.log('\nProcesando fecha:', fecha);
        const data = asistenciasGuardadas[fecha];
        if (!data) {
            console.log('No hay datos para esta fecha');
            continue;
        }

        const alumnosFaltantes = alumnosData.filter(alumno =>
            determinarFalta(alumno, data.asistencias, fecha)
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

    // Calcular mensajes por alumno
    const resumenPorAlumno = [];
    for (const id in ausenciasPorAlumno) {
        const { alumno, fechas } = ausenciasPorAlumno[id];
        
        if (alumno.celular && alumno.celular.length >= 9) {
            alumnosConCelular++;
            const plantilla = fechas.length > 1 ? 'alertafaltasvarias' : 'alerta_faltas';
            resumenPorAlumno.push({
                nombre: alumno.nombre,
                celular: alumno.celular,
                seccion: alumno.seccion,
                fechas: fechas.length,
                plantilla: plantilla,
                mensajes: 1 // 1 mensaje por alumno
            });
            totalMensajes++;
        } else {
            alumnosSinCelular++;
        }
    }

    // Crear modal con el resumen
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 10px;
        max-width: 800px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

    const fechaFormateada = Array.from(selectedAttendanceFiles)
        .sort()
        .map(f => new Date(f).toLocaleDateString('es-ES'))
        .join(', ');

    content.innerHTML = `
        <h2 style="color: #333; margin-bottom: 20px; text-align: center;">
            📱 Resumen de Envío de Mensajes
        </h2>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #495057; margin-top: 0;">📊 Estadísticas Generales</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #1976d2;">${totalMensajes}</div>
                    <div style="color: #666;">Total de Mensajes</div>
                </div>
                <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">${alumnosConCelular}</div>
                    <div style="color: #666;">Alumnos con Celular</div>
                </div>
                <div style="background: #fff3e0; padding: 15px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #f57c00;">${alumnosSinCelular}</div>
                    <div style="color: #666;">Sin Número</div>
                </div>
                <div style="background: #f3e5f5; padding: 15px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #7b1fa2;">${selectedAttendanceFiles.size}</div>
                    <div style="color: #666;">Fechas Seleccionadas</div>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <h3 style="color: #495057;">📅 Fechas de Inasistencia</h3>
            <p style="background: #fff3cd; padding: 10px; border-radius: 5px; border-left: 4px solid #ffc107;">
                <strong>Fechas:</strong> ${fechaFormateada}
            </p>
        </div>

        <div style="margin-bottom: 20px;">
            <h3 style="color: #495057;">👥 Detalle por Alumno</h3>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8f9fa;">
                        <tr>
                            <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Alumno</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Sección</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Celular</th>
                            <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">Faltas</th>
                            <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">Plantilla</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resumenPorAlumno.map(alumno => `
                            <tr>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${alumno.nombre}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${alumno.seccion}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${alumno.celular}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
                                    <span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                                        ${alumno.fechas}
                                    </span>
                                </td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
                                    <span style="background: #17a2b8; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                                        ${alumno.plantilla}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div style="background: #d4edda; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <h4 style="color: #155724; margin-top: 0;">💰 Costo Estimado</h4>
            <p style="margin: 0; color: #155724;">
                <strong>Mensajes a enviar:</strong> ${totalMensajes} | 
                <strong>Costo aproximado:</strong> $${(totalMensajes * 0.005).toFixed(3)} USD
                <br><small>(Basado en ~$0.005 por mensaje de WhatsApp Business API)</small>
            </p>
        </div>

        <div style="display: flex; gap: 10px; justify-content: center;">
            <button onclick="this.closest('.modal-overlay').remove()" 
                    style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                ❌ Cancelar
            </button>
            <button onclick="confirmarEnvioMensajes()" 
                    style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
                ✅ Confirmar Envío (${totalMensajes} mensajes)
            </button>
        </div>
    `;

    modal.className = 'modal-overlay';
    modal.appendChild(content);
    document.body.appendChild(modal);
}

// Función para confirmar el envío después de mostrar el resumen
async function confirmarEnvioMensajes() {
    // Remover el modal de resumen
    document.querySelector('.modal-overlay').remove();
    
    // Ejecutar el envío real
    await sendWhatsAppNotifications();
}

// Modificar la función original para que use el resumen
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

    alert(`✅ Notificaciones enviadas:\n- Enviados: ${totalEnviados}\n- Errores: ${totalErrores}`);
}



// Cargar datos guardados al iniciar
window.onload = function() {
    loadAvailableFiles();
    loadAttendanceFiles();
    cargarSeccionesDisponibles(); // Cargar secciones disponibles
    
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