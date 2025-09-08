const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Credenciales hardcodeadas (cambiar cuando se implemente entrada por consola)
const RUT = '79.978.870-5';
const CLAVE = '1234';

// Directorio de salida por defecto
const destino = process.env.DESTINO || './sii_boletas_output';

/****************************************************************************************
 * Helpers generales
 ****************************************************************************************/
function askQuestion(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((res) => setTimeout(res, ms));
}

function makeLogger(execLogPath) {
  return function log(msg) {
    console.log(msg);
    fs.appendFileSync(execLogPath, msg + '\n', 'utf8');
  };
}

function writeErrorLog(errorLogPath, message) {
  fs.appendFileSync(errorLogPath, message + '\n', 'utf8');
}

function getLocalDateTimeString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
}

/****************************************************************************************
 * Función para escribir texto carácter por carácter con delay
 ****************************************************************************************/
async function typeSlowly(page, selector, text, delayMs = 1000) {
  await page.focus(selector);
  await page.evaluate((sel) => {
    document.querySelector(sel).value = '';
  }, selector);
  
  for (let char of text) {
    await page.type(selector, char, { delay: 100 });
    await delay(delayMs);
  }
}

/****************************************************************************************
 * Función para realizar login en el SII
 ****************************************************************************************/
async function loginSII(page, log, errorLogPath) {
  try {
    log('Iniciando proceso de login en SII...');
    
    // Navegar a la página de login
    await page.goto('https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    log('Página de login cargada');
    
    // Esperar a que los elementos estén disponibles
    await page.waitForSelector('#rutcntr', { visible: true, timeout: 10000 });
    await page.waitForSelector('#clave', { visible: true, timeout: 10000 });
    await page.waitForSelector('#bt_ingresar', { visible: true, timeout: 10000 });
    
    log('Elementos de login encontrados');
    
    // Escribir RUT con delay
    log(`Escribiendo RUT: ${RUT}`);
    await typeSlowly(page, '#rutcntr', RUT, 50);
    
    await delay(600);
    
    // Escribir clave con delay
    log('Escribiendo clave...');
    await typeSlowly(page, '#clave', CLAVE, 50);
    
    await delay(600);
    
    // Hacer clic en el botón de ingresar
    log('Haciendo clic en botón Ingresar');
    await page.click('#bt_ingresar');
    
    // Esperar a que se complete el login (navegación o carga de nueva página)
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      log('Login completado - navegación detectada');
    } catch (navError) {
      // Si no hay navegación, verificar si hay elementos de la página principal
      try {
        await page.waitForSelector('#main-menu', { timeout: 10000 });
        log('Login completado - elementos de página principal detectados');
      } catch (elementError) {
        throw new Error('No se pudo verificar el login exitoso');
      }
    }
    
    return true;
  } catch (error) {
    const errorMsg = `Error en login SII: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * Función para navegar al menú de boletas de honorarios
 ****************************************************************************************/
async function navegarABoletasHonorarios(page, log, errorLogPath) {
  try {
    log('Navegando al menú de Servicios online...');
    
    // Buscar el menú principal
    await page.waitForSelector('#main-menu', { visible: true, timeout: 10000 });
    
    // Hacer hover en "Servicios online"
    const serviciosOnlineSelector = '#main-menu li.dropdown a[href="https://www.sii.cl/servicios_online/"]';
    await page.waitForSelector(serviciosOnlineSelector, { visible: true, timeout: 10000 });
    
    log('Haciendo hover en Servicios online');
    await page.hover(serviciosOnlineSelector);
    
    // Esperar a que aparezca el dropdown
    await page.waitForFunction(() => {
      const dropdown = document.querySelector('#main-menu li.dropdown .dropdown-menu');
      return dropdown && dropdown.style.display !== 'none';
    }, { timeout: 5000 });
    
    log('Dropdown de Servicios online desplegado');
    
    // Buscar y hacer clic en "Boletas de honorarios electrónicas"
    const boletasHonorariosSelector = '#main-menu .dropdown-menu a[href="https://www.sii.cl/servicios_online/1040-.html"]';
    await page.waitForSelector(boletasHonorariosSelector, { visible: true, timeout: 10000 });
    
    log('Haciendo clic en Boletas de honorarios electrónicas');
    await page.click(boletasHonorariosSelector);
    
    // Esperar a que cargue la nueva página
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    log('Página de Boletas de honorarios electrónicas cargada');
    
    return true;
  } catch (error) {
    const errorMsg = `Error navegando a boletas de honorarios: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * Función para hacer clic en "Emisor de boleta de honorarios"
 ****************************************************************************************/
async function clickEmisorBoleta(page, log, errorLogPath) {
  try {
    log('Buscando enlace "Emisor de boleta de honorarios"...');
    
    // Buscar el enlace de emisor de boleta de honorarios
    // Puede estar en diferentes formas, probamos varias opciones
    const posibleSelectores = [
      'a[href*="emisor"]',
      'a[href*="Emisor"]',
      'a:contains("Emisor de boleta de honorarios")',
      '.accordion a:contains("Emisor")',
      '[data-target*="emisor"]'
    ];
    
    let selectorEncontrado = null;
    
    // Intentar encontrar el elemento con JavaScript
    const enlaceEmisor = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const encontrado = links.find(link => 
        link.textContent.toLowerCase().includes('emisor de boleta de honorarios') ||
        link.textContent.toLowerCase().includes('emisor de boleta') ||
        link.href.toLowerCase().includes('emisor')
      );
      return encontrado ? encontrado.outerHTML : null;
    });
    
    if (!enlaceEmisor) {
      throw new Error('No se encontró el enlace "Emisor de boleta de honorarios"');
    }
    
    log(`Enlace encontrado: ${enlaceEmisor}`);
    
    // Hacer clic usando evaluate para mayor confiabilidad
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const enlace = links.find(link => 
        link.textContent.toLowerCase().includes('emisor de boleta de honorarios') ||
        link.textContent.toLowerCase().includes('emisor de boleta')
      );
      if (enlace) {
        enlace.scrollIntoView({ behavior: 'smooth', block: 'center' });
        enlace.click();
      }
    });
    
    log('Clic realizado en "Emisor de boleta de honorarios"');
    
    // Esperar a que cargue el contenido o cambie la página
    await delay(2000);
    
    return true;
  } catch (error) {
    const errorMsg = `Error haciendo clic en Emisor de boleta: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * Función para hacer clic en "Consultas sobre boletas de honorarios electrónicas"
 ****************************************************************************************/
async function clickConsultasBoletas(page, log, errorLogPath) {
  try {
    log('Buscando "Consultas sobre boletas de honorarios electrónicas"...');
    
    // Buscar el enlace de consultas
    const enlaceConsultas = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const encontrado = links.find(link => 
        link.textContent.toLowerCase().includes('consultas sobre boletas de honorarios electrónicas') ||
        link.textContent.toLowerCase().includes('consultas sobre boletas')
      );
      return encontrado ? encontrado.outerHTML : null;
    });
    
    if (!enlaceConsultas) {
      throw new Error('No se encontró el enlace "Consultas sobre boletas de honorarios electrónicas"');
    }
    
    log(`Enlace de consultas encontrado: ${enlaceConsultas}`);
    
    // Hacer clic en consultas
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const enlace = links.find(link => 
        link.textContent.toLowerCase().includes('consultas sobre boletas de honorarios electrónicas') ||
        link.textContent.toLowerCase().includes('consultas sobre boletas')
      );
      if (enlace) {
        enlace.scrollIntoView({ behavior: 'smooth', block: 'center' });
        enlace.click();
      }
    });
    
    log('Clic realizado en "Consultas sobre boletas de honorarios electrónicas"');
    
    // Esperar a que se despliegue el acordeón
    await delay(3000);
    
    return true;
  } catch (error) {
    const errorMsg = `Error haciendo clic en Consultas sobre boletas: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * Función para hacer clic en "Consultar boletas emitidas"
 ****************************************************************************************/
async function clickConsultarBoletasEmitidas(page, log, errorLogPath) {
  try {
    log('Buscando "Consultar boletas emitidas"...');
    
    // Buscar el enlace de consultar boletas emitidas
    const enlaceConsultarEmitidas = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const encontrado = links.find(link => 
        link.textContent.toLowerCase().includes('consultar boletas emitidas')
      );
      return encontrado ? encontrado.outerHTML : null;
    });
    
    if (!enlaceConsultarEmitidas) {
      throw new Error('No se encontró el enlace "Consultar boletas emitidas"');
    }
    
    log(`Enlace "Consultar boletas emitidas" encontrado: ${enlaceConsultarEmitidas}`);
    
    // Hacer clic en consultar boletas emitidas
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const enlace = links.find(link => 
        link.textContent.toLowerCase().includes('consultar boletas emitidas')
      );
      if (enlace) {
        enlace.scrollIntoView({ behavior: 'smooth', block: 'center' });
        enlace.click();
      }
    });
    
    log('Clic realizado en "Consultar boletas emitidas"');
    
    // Esperar a que cargue el contenido
    await delay(3000);
    
    return true;
  } catch (error) {
    const errorMsg = `Error haciendo clic en Consultar boletas emitidas: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * Función para generar nombre de archivo con RUT + fecha + hora
 ****************************************************************************************/
function generarNombreArchivoScreenshot(rut) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  // Limpiar RUT para nombre de archivo (quitar puntos y guiones)
  const rutLimpio = rut.replace(/[.-]/g, '');
  
  return `${rutLimpio}_${dd}-${mm}-${yyyy}_${hh}-${min}-${ss}.png`;
}

/****************************************************************************************
 * Función para verificar tabla y capturar screenshot si todos los valores son cero
 ****************************************************************************************/
async function verificarYCapturarTabla(page, log, errorLogPath) {
  try {
    log('Iniciando análisis de tabla de resultados del informe anual...');
    
    // Esperar a que la tabla esté disponible
    await page.waitForFunction(() => {
      return document.querySelector('table[width="630"][border="1"]');
    }, { timeout: 15000 });
    
    log('Tabla encontrada, procediendo con el análisis...');
    
    // Extraer y analizar los datos de la tabla
    const analisisTabla = await page.evaluate(() => {
      const tabla = document.querySelector('table[width="630"][border="1"]');
      if (!tabla) return { error: 'Tabla no encontrada' };
      
      const tbody = tabla.querySelector('tbody');
      if (!tbody) return { error: 'Tbody no encontrado' };
      
      const filas = tbody.querySelectorAll('tr');
      const resultados = [];
      let todosLosTotalesSonCero = true;
      
      // Los meses están en las filas desde la índice 2 hasta la 13 (12 meses)
      // Fila 0: encabezados principales, Fila 1: subencabezados
      for (let i = 2; i < filas.length - 1; i++) { // -1 para excluir la fila de totales
        const fila = filas[i];
        const celdas = fila.querySelectorAll('td');
        
        if (celdas.length >= 9) { // Verificar que tenga todas las columnas necesarias
          // Primera celda contiene el mes
          const mes = celdas[0].textContent.trim();
          
          // Última celda contiene el Total Líquido
          const totalLiquidoRaw = celdas[8].textContent.trim();
          
          // Normalizar el valor: quitar espacios, puntos, comas, &nbsp; y otros caracteres
          let totalLiquidoLimpio = totalLiquidoRaw
            .replace(/&nbsp;/g, '')
            .replace(/\s+/g, '')
            .replace(/\./g, '')
            .replace(/,/g, '')
            .replace(/[^\d]/g, ''); // Mantener solo dígitos
          
          // Si está vacío después de limpiar, considerarlo como "0"
          if (totalLiquidoLimpio === '') {
            totalLiquidoLimpio = '0';
          }
          
          const esValorCero = totalLiquidoLimpio === '0';
          
          if (!esValorCero) {
            todosLosTotalesSonCero = false;
          }
          
          resultados.push({
            mes: mes,
            totalLiquidoRaw: totalLiquidoRaw,
            totalLiquidoLimpio: totalLiquidoLimpio,
            esValorCero: esValorCero
          });
        }
      }
      
      return {
        resultados: resultados,
        todosLosTotalesSonCero: todosLosTotalesSonCero,
        totalMesesAnalizados: resultados.length
      };
    });
    
    if (analisisTabla.error) {
      throw new Error(analisisTabla.error);
    }
    
    log(`Análisis completado. Meses analizados: ${analisisTabla.totalMesesAnalizados}`);
    
    // Log detallado de cada mes
    analisisTabla.resultados.forEach((resultado, index) => {
      const status = resultado.esValorCero ? '[CERO]' : '[TIENE VALOR]';
      log(`  ${resultado.mes}: ${status} - Valor bruto: "${resultado.totalLiquidoRaw}" -> Limpio: "${resultado.totalLiquidoLimpio}"`);
    });
    
    // Verificar si todos los totales son cero
    if (analisisTabla.todosLosTotalesSonCero) {
      log('⚠️ TODOS LOS TOTALES SON CERO - Procediendo a tomar screenshot...');
      
      // Generar nombre de archivo
      const rutEmpresa = RUT; // Usar el RUT de las credenciales
      const nombreArchivo = generarNombreArchivoScreenshot(rutEmpresa);
      const rutaScreenshot = path.join(destino, nombreArchivo);
      
      // Tomar screenshot de página completa
      await page.screenshot({ 
        path: rutaScreenshot, 
        fullPage: true 
      });
      
      log(`📸 Screenshot guardado: ${rutaScreenshot}`);
      log(`📊 Motivo: Todos los valores de Total Líquido (${analisisTabla.totalMesesAnalizados} meses) son cero o están vacíos`);
      
      return {
        screenshotTomado: true,
        rutaArchivo: rutaScreenshot,
        motivoScreenshot: 'Todos los totales líquidos son cero',
        mesesAnalizados: analisisTabla.totalMesesAnalizados,
        datosDetallados: analisisTabla.resultados
      };
      
    } else {
      log('✅ Se encontraron valores diferentes de cero - No es necesario tomar screenshot');
      
      // Mostrar cuáles meses tienen valores
      const mesesConValor = analisisTabla.resultados.filter(r => !r.esValorCero);
      log(`📈 Meses con valores: ${mesesConValor.map(m => m.mes).join(', ')}`);
      
      return {
        screenshotTomado: false,
        motivoNoScreenshot: 'Se encontraron valores diferentes de cero',
        mesesConValor: mesesConValor.length,
        mesesAnalizados: analisisTabla.totalMesesAnalizados,
        datosDetallados: analisisTabla.resultados
      };
    }
    
  } catch (error) {
    const errorMsg = `Error verificando tabla: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return { 
      screenshotTomado: false, 
      error: errorMsg 
    };
  }
}

/****************************************************************************************
 * Función para hacer clic en el botón "Consultar" (cmdconsultar124)
 ****************************************************************************************/
async function clickBotonConsultar124(page, log, errorLogPath) {
  try {
    log('Buscando botón "Consultar" con ID cmdconsultar124...');
    
    // Esperar a que el botón esté disponible y visible
    await page.waitForSelector('#cmdconsultar124', { visible: true, timeout: 15000 });
    
    log('Botón "Consultar" encontrado');
    
    // Verificar que el botón existe y obtener información sobre él
    const botonInfo = await page.evaluate(() => {
      const boton = document.querySelector('#cmdconsultar124');
      if (boton) {
        return {
          existe: true,
          visible: boton.offsetParent !== null,
          texto: boton.value,
          onclick: boton.getAttribute('onclick'),
          html: boton.outerHTML
        };
      }
      return { existe: false };
    });
    
    if (!botonInfo.existe) {
      throw new Error('El botón cmdconsultar124 no existe');
    }
    
    log(`Información del botón: ${JSON.stringify(botonInfo, null, 2)}`);
    
    // Hacer scroll al botón y hacer clic
    await page.evaluate(() => {
      const boton = document.querySelector('#cmdconsultar124');
      if (boton) {
        boton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    
    await randomDelay(1000, 2000);
    
    // Intentar hacer clic usando diferentes métodos
    let clickExitoso = false;
    
    // Método 1: Click directo
    try {
      await page.click('#cmdconsultar124');
      log('Clic realizado usando método directo');
      clickExitoso = true;
    } catch (error1) {
      log(`Método 1 falló: ${error1.message}`);
      
      // Método 2: Click usando evaluate
      try {
        await page.evaluate(() => {
          const boton = document.querySelector('#cmdconsultar124');
          if (boton) {
            boton.click();
          }
        });
        log('Clic realizado usando page.evaluate');
        clickExitoso = true;
      } catch (error2) {
        log(`Método 2 falló: ${error2.message}`);
        
        // Método 3: Ejecutar la función onclick directamente
        try {
          await page.evaluate(() => {
            if (typeof presionaBoton === 'function') {
              presionaBoton('validar_anual');
            }
          });
          log('Función presionaBoton ejecutada directamente');
          clickExitoso = true;
        } catch (error3) {
          log(`Método 3 falló: ${error3.message}`);
        }
      }
    }
    
    if (!clickExitoso) {
      throw new Error('No se pudo hacer clic en el botón con ningún método');
    }
    
    log('Esperando navegación o carga de nueva página...');
    
    // Esperar a que se procese la acción
    await randomDelay(3000, 5000);
    
    // Verificar si hubo navegación o cambio en la página
    const nuevaURL = page.url();
    log(`URL actual después del clic: ${nuevaURL}`);
    
    return true;
    
  } catch (error) {
    const errorMsg = `Error haciendo clic en botón Consultar124: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * Función principal
 ****************************************************************************************/
async function procesarSIIBoletas() {
  // Configurar directorios y logs
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true });
  }
  
  const execLogPath = path.join(destino, 'sii_exec_log.txt');
  const errorLogPath = path.join(destino, 'sii_error_log.txt');
  
  fs.writeFileSync(execLogPath, '', 'utf8');
  fs.writeFileSync(errorLogPath, '', 'utf8');
  
  const log = makeLogger(execLogPath);
  
  let browser, page;
  
  try {
    log('Iniciando navegador...');
    
    browser = await puppeteer.launch({
      headless: false, // Cambiado a false para ver la interacción
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    log('Navegador iniciado correctamente');
    
    // Paso 1: Login
    const loginExitoso = await loginSII(page, log, errorLogPath);
    if (!loginExitoso) {
      throw new Error('Login fallido');
    }
    
    await randomDelay(500, 1500);
    
    // Paso 2: Navegar a boletas de honorarios
    const navegacionExitosa = await navegarABoletasHonorarios(page, log, errorLogPath);
    if (!navegacionExitosa) {
      throw new Error('Navegación a boletas de honorarios fallida');
    }
    
    await randomDelay(500, 1500);
    
    // Paso 3: Hacer clic en "Emisor de boleta de honorarios"
    const clickEmisorExitoso = await clickEmisorBoleta(page, log, errorLogPath);
    if (!clickEmisorExitoso) {
      throw new Error('Clic en Emisor de boleta fallido');
    }
    
    await randomDelay(500, 1500);
    
    // Paso 4: Hacer clic en "Consultas sobre boletas de honorarios electrónicas"
    const clickConsultasExitoso = await clickConsultasBoletas(page, log, errorLogPath);
    if (!clickConsultasExitoso) {
      throw new Error('Clic en Consultas sobre boletas fallido');
    }
    
    await randomDelay(500, 1500);
    
    // Paso 5: Hacer clic en "Consultar boletas emitidas"
    const clickConsultarExitoso = await clickConsultarBoletasEmitidas(page, log, errorLogPath);
    if (!clickConsultarExitoso) {
      throw new Error('Clic en Consultar boletas emitidas fallido');
    }
    
    await randomDelay(500, 1500);
    
    // Paso 6: Hacer clic en el botón "Consultar" (cmdconsultar124)
    const clickBoton124Exitoso = await clickBotonConsultar124(page, log, errorLogPath);
    if (!clickBoton124Exitoso) {
      throw new Error('Clic en botón Consultar124 fallido');
    }
    
    await randomDelay(500, 1500);
    
    // Paso 7: Verificar tabla y capturar screenshot si todos los valores son cero
    const resultadoVerificacion = await verificarYCapturarTabla(page, log, errorLogPath);
    
    if (resultadoVerificacion.error) {
      log(`Error en verificación de tabla: ${resultadoVerificacion.error}`);
    } else if (resultadoVerificacion.screenshotTomado) {
      log(`Screenshot tomado por valores en cero: ${resultadoVerificacion.rutaArchivo}`);
      log(`Resumen: ${resultadoVerificacion.mesesAnalizados} meses analizados, todos con totales en cero`);
    } else {
      log(`Verificación completada: ${resultadoVerificacion.mesesConValor} meses con valores, no se requiere screenshot`);
    }
    
    log('Proceso completado exitosamente');
    log('Análisis del informe anual de boletas de honorarios finalizado');
    
    // Tomar screenshot final
    const screenshotPath = path.join(destino, `sii_final_${getLocalDateTimeString().replace(/[: ]/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot final guardado en: ${screenshotPath}`);
    
    // Mantener el navegador abierto por un momento para verificación
    await delay(10000);
    
  } catch (error) {
    const errorMsg = `Error en procesamiento SII: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    console.error(errorMsg);
  } finally {
    if (browser) {
      await browser.close();
      log('Navegador cerrado');
    }
  }
}

/****************************************************************************************
 * Ejecutar el programa
 ****************************************************************************************/
(async () => {
  try {
    console.log('Script SII Boletas de Honorarios');
    console.log('=================================');
    console.log(`RUT: ${RUT}`);
    console.log(`Directorio de salida: ${destino}`);
    console.log('');
    
    await procesarSIIBoletas();
    
  } catch (err) {
    console.error('Error en la ejecución:', err);
  }
})();