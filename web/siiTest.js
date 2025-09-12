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
const destino = process.env.DESTINO || 'C:\\Users\\sopor\\OneDrive\\Desktop\\Otros';

if (!fs.existsSync(destino)){
    fs.mkdirSync(destino, {recursive: true});
}

// Helpers optimizados para velocidad
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

// Delays más cortos para mayor velocidad
function quickDelay(minMs = 200, maxMs = 500) {
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
 * Función optimizada para escribir texto más rápido
 ****************************************************************************************/
async function typeFast(page, selector, text) {
  await page.focus(selector);
  await page.evaluate((sel, txt) => {
    const element = document.querySelector(sel);
    element.value = '';
    element.value = txt;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, text);
}

/****************************************************************************************
 * Función optimizada para realizar login en el SII
 ****************************************************************************************/
async function loginSII(page, log, errorLogPath) {
  try {
    log('Iniciando proceso de login rápido en SII...');
    
    // Navegar a la página de login
    await page.goto('https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi', {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
    
    log('Página de login cargada');
    
    // Esperar elementos con timeout reducido
    await page.waitForSelector('#rutcntr', { visible: true, timeout: 5000 });
    await page.waitForSelector('#clave', { visible: true, timeout: 5000 });
    await page.waitForSelector('#bt_ingresar', { visible: true, timeout: 5000 });
    
    log('Elementos de login encontrados');
    
    // Escribir datos rápidamente
    log(`Escribiendo RUT: ${RUT}`);
    await typeFast(page, '#rutcntr', RUT);
    
    await quickDelay(100, 200);
    
    log('Escribiendo clave...');
    await typeFast(page, '#clave', CLAVE);
    
    await quickDelay(100, 200);
    
    // Hacer clic en el botón de ingresar
    log('Haciendo clic en botón Ingresar');
    await page.click('#bt_ingresar');
    
    // Esperar login con timeout reducido
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 });
      log('Login completado - navegación detectada');
    } catch (navError) {
      try {
        await page.waitForSelector('#main-menu', { timeout: 5000 });
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
 * Función optimizada para navegar al menú de boletas de honorarios
 ****************************************************************************************/
async function navegarABoletasHonorarios(page, log, errorLogPath) {
  try {
    log('Navegando al menú de Servicios online...');
    
    await page.waitForSelector('#main-menu', { visible: true, timeout: 5000 });
    
    const serviciosOnlineSelector = '#main-menu li.dropdown a[href="https://www.sii.cl/servicios_online/"]';
    await page.waitForSelector(serviciosOnlineSelector, { visible: true, timeout: 5000 });
    
    log('Haciendo hover en Servicios online');
    await page.hover(serviciosOnlineSelector);
    
    await page.waitForFunction(() => {
      const dropdown = document.querySelector('#main-menu li.dropdown .dropdown-menu');
      return dropdown && dropdown.style.display !== 'none';
    }, { timeout: 3000 });
    
    log('Dropdown desplegado');
    
    const boletasHonorariosSelector = '#main-menu .dropdown-menu a[href="https://www.sii.cl/servicios_online/1040-.html"]';
    await page.waitForSelector(boletasHonorariosSelector, { visible: true, timeout: 5000 });
    
    log('Haciendo clic en Boletas de honorarios electrónicas');
    await page.click(boletasHonorariosSelector);
    
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 });
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
 * Función optimizada para clicks rápidos con múltiples métodos
 ****************************************************************************************/
async function clickRapido(page, textoBuscar, log, nombreElemento) {
  try {
    log(`Buscando y haciendo clic en "${nombreElemento}"...`);
    
    const clickExitoso = await page.evaluate((texto) => {
      const links = Array.from(document.querySelectorAll('a'));
      const enlace = links.find(link => 
        link.textContent.toLowerCase().includes(texto.toLowerCase())
      );
      if (enlace) {
        enlace.scrollIntoView({ behavior: 'instant', block: 'center' });
        enlace.click();
        return true;
      }
      return false;
    }, textoBuscar);
    
    if (!clickExitoso) {
      throw new Error(`No se encontró el enlace "${nombreElemento}"`);
    }
    
    log(`✅ Clic realizado en "${nombreElemento}"`);
    await quickDelay(300, 600);
    
    return true;
  } catch (error) {
    const errorMsg = `Error haciendo clic en ${nombreElemento}: ${error.message}`;
    log(errorMsg);
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
  
  const rutLimpio = rut.replace(/[.-]/g, '');
  return `${rutLimpio}_${dd}-${mm}-${yyyy}_${hh}-${min}-${ss}.png`;
}

/****************************************************************************************
 * Función optimizada para verificar tabla y capturar screenshot
 ****************************************************************************************/
async function verificarYCapturarTabla(page, log, errorLogPath) {
  try {
    log('Analizando tabla de resultados...');
    
    await page.waitForFunction(() => {
      return document.querySelector('table[width="630"][border="1"]');
    }, { timeout: 8000 });
    
    log('Tabla encontrada, analizando...');
    
    const analisisTabla = await page.evaluate(() => {
      const tabla = document.querySelector('table[width="630"][border="1"]');
      if (!tabla) return { error: 'Tabla no encontrada' };
      
      const tbody = tabla.querySelector('tbody');
      if (!tbody) return { error: 'Tbody no encontrado' };
      
      const filas = tbody.querySelectorAll('tr');
      const resultados = [];
      let todosLosTotalesSonCero = true;
      
      for (let i = 2; i < filas.length - 1; i++) {
        const fila = filas[i];
        const celdas = fila.querySelectorAll('td');
        
        if (celdas.length >= 9) {
          const mes = celdas[0].textContent.trim();
          const totalLiquidoRaw = celdas[8].textContent.trim();
          
          let totalLiquidoLimpio = totalLiquidoRaw
            .replace(/&nbsp;/g, '')
            .replace(/\s+/g, '')
            .replace(/\./g, '')
            .replace(/,/g, '')
            .replace(/[^\d]/g, '');
          
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
    
    log(`Análisis completado. Meses: ${analisisTabla.totalMesesAnalizados}`);
    
    if (analisisTabla.todosLosTotalesSonCero) {
      log('⚠️ TODOS LOS TOTALES SON CERO - Tomando screenshot...');
      
      const nombreArchivo = generarNombreArchivoScreenshot(RUT);
      const rutaScreenshot = path.join(destino, nombreArchivo);
      
      await page.screenshot({ 
        path: rutaScreenshot, 
        fullPage: true 
      });
      
      log(`📸 Screenshot guardado: ${rutaScreenshot}`);
      
      return {
        screenshotTomado: true,
        rutaArchivo: rutaScreenshot,
        mesesAnalizados: analisisTabla.totalMesesAnalizados
      };
      
    } else {
      log('✅ Valores encontrados - No screenshot necesario');
      
      const mesesConValor = analisisTabla.resultados.filter(r => !r.esValorCero);
      log(`📈 Meses con valores: ${mesesConValor.length}/${analisisTabla.totalMesesAnalizados}`);
      
      return {
        screenshotTomado: false,
        mesesConValor: mesesConValor.length,
        mesesAnalizados: analisisTabla.totalMesesAnalizados
      };
    }
    
  } catch (error) {
    const errorMsg = `Error verificando tabla: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return { screenshotTomado: false, error: errorMsg };
  }
}

/****************************************************************************************
 * Función optimizada para hacer clic en botón consultar
 ****************************************************************************************/
async function clickBotonConsultarRapido(page, log, errorLogPath, tipoConsulta = 'validar_anual') {
  try {
    log(`Buscando botón "Consultar" para ${tipoConsulta}...`);
    
    await page.waitForSelector('#cmdconsultar124', { visible: true, timeout: 5000 });
    
    log('Botón encontrado, haciendo clic...');
    
    let clickExitoso = false;
    
    // Método 1: Click directo
    try {
      await page.click('#cmdconsultar124');
      clickExitoso = true;
    } catch (error1) {
      // Método 2: Click usando evaluate
      try {
        await page.evaluate(() => {
          document.querySelector('#cmdconsultar124').click();
        });
        clickExitoso = true;
      } catch (error2) {
        // Método 3: Ejecutar función directamente
        try {
          await page.evaluate((tipo) => {
            if (typeof presionaBoton === 'function') {
              presionaBoton(tipo);
            }
          }, tipoConsulta);
          clickExitoso = true;
        } catch (error3) {
          log(`Todos los métodos fallaron`);
        }
      }
    }
    
    if (!clickExitoso) {
      throw new Error('No se pudo hacer clic en el botón');
    }
    
    log('✅ Botón consultar presionado');
    await quickDelay(1000, 2000);
    
    return true;
    
  } catch (error) {
    const errorMsg = `Error haciendo clic en botón consultar: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

/****************************************************************************************
 * NUEVAS FUNCIONES OPTIMIZADAS PARA BOLETAS RECIBIDAS
 ****************************************************************************************/

function generarDirectorioBoletasRecibidas() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  const nombreCarpeta = `Boletas_Recibidas_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
  const rutaCarpeta = path.join(destino, nombreCarpeta);
  
  if (!fs.existsSync(rutaCarpeta)) {
    fs.mkdirSync(rutaCarpeta, { recursive: true });
  }
  
  return { rutaCarpeta, nombreCarpeta };
}

async function navegarRapidoAConsultas(page, log, errorLogPath) {
  try {
    log('Navegando rápidamente a página de consultas...');
    
    await page.goto('https://www.sii.cl/servicios_online/1040-1287.html', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    log('Página de consultas cargada');
    await quickDelay(500, 1000);
    
    return true;
  } catch (error) {
    const errorMsg = `Error navegando a consultas: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

async function clickBoletasRecibidasRapido(page, log, errorLogPath) {
  try {
    log('Buscando "Consultar boletas recibidas"...');
    
    await page.waitForFunction(() => {
      return document.readyState === 'complete';
    }, { timeout: 5000 });
    
    const clickExitoso = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const enlace = links.find(link => 
        link.href.includes("linkVisita('https://loa.sii.cl/cgi_IMT/TMBCOC_MenuConsultasContribRec.cgi") ||
        link.textContent.toLowerCase().includes('consultar boletas recibidas')
      );
      
      if (enlace) {
        enlace.scrollIntoView({ behavior: 'instant', block: 'center' });
        enlace.click();
        return true;
      }
      return false;
    });
    
    if (!clickExitoso) {
      // Método alternativo: ejecutar función linkVisita directamente
      await page.evaluate(() => {
        if (typeof linkVisita === 'function') {
          linkVisita('https://loa.sii.cl/cgi_IMT/TMBCOC_MenuConsultasContribRec.cgi?dummy=1461943244650', 'Consultar_boletas_recibidas');
        }
      });
    }
    
    log('✅ Clic en "Consultar boletas recibidas" realizado');
    await quickDelay(1000, 2000);
    
    return true;
    
  } catch (error) {
    const errorMsg = `Error en clic boletas recibidas: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

async function capturarScreenshotRapido(page, log, errorLogPath) {
  try {
    log('Capturando screenshot de boletas recibidas...');
    
    const dirInfo = generarDirectorioBoletasRecibidas();
    
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    
    const nombreArchivo = `boletas_recibidas_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.png`;
    const rutaCompleta = path.join(dirInfo.rutaCarpeta, nombreArchivo);
    
    await quickDelay(500, 1000);
    
    await page.screenshot({ 
      path: rutaCompleta, 
      fullPage: true 
    });
    
    log(`📸 Screenshot guardado: ${rutaCompleta}`);
    log(`📁 Directorio: ${dirInfo.nombreCarpeta}`);
    
    // Crear archivo de información básico
    const logPath = path.join(dirInfo.rutaCarpeta, 'info_captura.txt');
    const infoCaptura = `Captura: ${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}\nRUT: ${RUT}\nArchivo: ${nombreArchivo}`;
    fs.writeFileSync(logPath, infoCaptura, 'utf8');
    
    return {
      screenshotTomado: true,
      rutaArchivo: rutaCompleta,
      nombreDirectorio: dirInfo.nombreCarpeta,
      nombreArchivo: nombreArchivo
    };
    
  } catch (error) {
    const errorMsg = `Error capturando screenshot: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return { screenshotTomado: false, error: errorMsg };
  }
}

/****************************************************************************************
 * FUNCIÓN PRINCIPAL OPTIMIZADA PARA VELOCIDAD
 ****************************************************************************************/
async function procesarSIIBoletasRapido() {
  // Configurar directorios y logs
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true });
  }
  
  const execLogPath = path.join(destino, 'sii_exec_log_rapido.txt');
  const errorLogPath = path.join(destino, 'sii_error_log_rapido.txt');
  
  fs.writeFileSync(execLogPath, '', 'utf8');
  fs.writeFileSync(errorLogPath, '', 'utf8');
  
  const log = makeLogger(execLogPath);
  
  let browser, page;
  const tiempoInicio = Date.now();
  
  try {
    log('🚀 Iniciando proceso SII RÁPIDO...');
    
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Deshabilitar imágenes y CSS para mayor velocidad
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(req.resourceType() == 'stylesheet' || req.resourceType() == 'image'){
        req.abort();
      } else {
        req.continue();
      }
    });
    
    log('✅ Navegador iniciado (modo rápido)');
    
    // FLUJO RÁPIDO BOLETAS EMITIDAS
    log('=== FLUJO BOLETAS EMITIDAS (RÁPIDO) ===');
    
    // Paso 1: Login rápido
    const loginExitoso = await loginSII(page, log, errorLogPath);
    if (!loginExitoso) throw new Error('Login fallido');
    
    await quickDelay();
    
    // Paso 2: Navegar a boletas de honorarios
    const navegacionExitosa = await navegarABoletasHonorarios(page, log, errorLogPath);
    if (!navegacionExitosa) throw new Error('Navegación fallida');
    
    await quickDelay();
    
    // Pasos 3-5: Clicks rápidos secuenciales
    const paso3 = await clickRapido(page, 'emisor de boleta de honorarios', log, 'Emisor de boleta');
    if (!paso3) throw new Error('Clic en Emisor fallido');
    
    await quickDelay();
    
    const paso4 = await clickRapido(page, 'consultas sobre boletas de honorarios', log, 'Consultas sobre boletas');
    if (!paso4) throw new Error('Clic en Consultas fallido');
    
    await quickDelay();
    
    const paso5 = await clickRapido(page, 'consultar boletas emitidas', log, 'Consultar boletas emitidas');
    if (!paso5) throw new Error('Clic en Consultar emitidas fallido');
    
    await quickDelay();
    
    // Paso 6: Botón consultar rápido
    const paso6 = await clickBotonConsultarRapido(page, log, errorLogPath, 'validar_anual');
    if (!paso6) throw new Error('Botón consultar fallido');
    
    await quickDelay();
    
    // Paso 7: Verificar tabla rápido
    const resultadoVerificacion = await verificarYCapturarTabla(page, log, errorLogPath);
    
    if (resultadoVerificacion.screenshotTomado) {
      log(`✅ Screenshot emitidas: ${resultadoVerificacion.rutaArchivo}`);
    } else {
      log(`✅ Emitidas: ${resultadoVerificacion.mesesConValor || 0} meses con valores`);
    }
    
    log('=== FLUJO BOLETAS RECIBIDAS (RÁPIDO) ===');
    
    await quickDelay();
    
    // FLUJO RÁPIDO BOLETAS RECIBIDAS
    // Paso 8: Navegar rápido a consultas
    const navegacionRegreso = await navegarRapidoAConsultas(page, log, errorLogPath);
    if (navegacionRegreso) {
      
      await quickDelay();
      
      // Paso 9: Click boletas recibidas rápido
      const clickRecibidas = await clickBoletasRecibidasRapido(page, log, errorLogPath);
      if (clickRecibidas) {
        
        await quickDelay();
        
        // Paso 10: Botón consultar recibidas rápido
        const consultarRecibidas = await clickBotonConsultarRapido(page, log, errorLogPath, 'validar_anual_rec');
        if (consultarRecibidas) {
          
          await quickDelay();
          
          // Paso 11: Screenshot rápido
          const screenshot = await capturarScreenshotRapido(page, log, errorLogPath);
          
          if (screenshot.screenshotTomado) {
            log(`✅ Screenshot recibidas: ${screenshot.nombreDirectorio}`);
          } else {
            log(`❌ Error screenshot: ${screenshot.error}`);
          }
        }
      }
    }
    
    const tiempoTotal = ((Date.now() - tiempoInicio) / 1000).toFixed(1);
    log(`🏁 PROCESO COMPLETADO EN ${tiempoTotal} SEGUNDOS`);
    log('=== RESUMEN RÁPIDO FINALIZADO ===');
    
    // Pausa breve antes de cerrar
    await delay(3000);
    
  } catch (error) {
    const errorMsg = `Error en procesamiento rápido SII: ${error.message}`;
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
 * Ejecutar el programa optimizado
 ****************************************************************************************/
(async () => {
  try {
    console.log('🚀 Script SII ULTRA RÁPIDO 🚀');
    console.log('===============================');
    console.log(`RUT: ${RUT}`);
    console.log(`Directorio: ${destino}`);
    console.log('Optimizaciones activadas:');
    console.log('  ⚡ Delays reducidos (200-500ms)');
    console.log('  ⚡ Timeouts cortos (3-8s)');
    console.log('  ⚡ Imágenes/CSS deshabilitados');
    console.log('  ⚡ Clicks directos optimizados');
    console.log('  ⚡ Navegación tipo "domcontentloaded"');
    console.log('');
    console.log('Iniciando proceso...');
    
    await procesarSIIBoletasRapido();
    
  } catch (err) {
    console.error('Error en la ejecución rápida:', err);
  }
})();