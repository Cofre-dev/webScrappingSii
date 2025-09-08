const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Variables globales para credenciales
let RUT = '';
let CLAVE = '';

// Directorio de salida por defecto
const destino = process.env.DESTINO || './sii_boletas_output';

/****************************************************************************************
 * Función simple para entrada de datos (sin dependencias externas)
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

function mostrarProgreso(paso, total, descripcion) {
  const porcentaje = Math.round((paso / total) * 100);
  const barraCompleta = 20;
  const barraLlena = Math.round((porcentaje / 100) * barraCompleta);
  const barraVacia = barraCompleta - barraLlena;
  
  const barra = '█'.repeat(barraLlena) + '░'.repeat(barraVacia);
  
  process.stdout.write(`\r🔄 [${barra}] ${porcentaje}% - ${descripcion}`);
  
  if (paso === total) {
    console.log('\n✅ Proceso completado!');
  }
}

/****************************************************************************************
 * Interfaz de Usuario simplificada
 ****************************************************************************************/
async function mostrarInterfazUsuario() {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    🏛️  SII BOLETAS DE HONORARIOS 🏛️            ║');
  console.log('║                      Verificador Automático                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('✨ Bienvenido al verificador automático de boletas de honorarios');
  console.log('📋 Este script automatizará el proceso de verificación en el SII');
  console.log('');
  
  // Solicitar datos de forma simple
  RUT = await askQuestion('🆔 Ingresa tu RUT (ej: 12.345.678-9): ');
  console.log('🔐 Ingresa tu clave tributaria:');
  CLAVE = await askQuestion('> ');
  
  const directorio = await askQuestion('📁 Directorio de salida (Enter para ./sii_boletas_output): ') || './sii_boletas_output';
  const confirmar = await askQuestion('🚀 ¿Iniciar proceso? (s/n): ');
  
  if (confirmar.toLowerCase() !== 's' && confirmar.toLowerCase() !== 'si') {
    console.log('❌ Proceso cancelado');
    process.exit(0);
  }
  
  console.log('');
  console.log('✅ Configuración completada:');
  console.log(`   🆔 RUT: ${RUT}`);
  console.log(`   🔐 Clave: ${'*'.repeat(CLAVE.length)}`);
  console.log(`   📁 Directorio: ${directorio}`);
  console.log('');
  console.log('🔄 Iniciando proceso automatizado...');
  console.log('⏱️  Este proceso puede tomar varios minutos');
  console.log('🖥️  Se abrirá una ventana del navegador para mostrar el progreso');
  console.log('');
  
  return {
    rut: RUT,
    clave: CLAVE,
    directorio: directorio
  };
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
    
    await page.goto('https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    log('Página de login cargada');
    
    await page.waitForSelector('#rutcntr', { visible: true, timeout: 10000 });
    await page.waitForSelector('#clave', { visible: true, timeout: 10000 });
    await page.waitForSelector('#bt_ingresar', { visible: true, timeout: 10000 });
    
    log('Elementos de login encontrados');
    
    log(`Escribiendo RUT: ${RUT}`);
    await typeSlowly(page, '#rutcntr', RUT, 50);
    
    await delay(600);
    
    log('Escribiendo clave...');
    await typeSlowly(page, '#clave', CLAVE, 50);
    
    await delay(600);
    
    log('Haciendo clic en botón Ingresar');
    await page.click('#bt_ingresar');
    
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      log('Login completado - navegación detectada');
    } catch (navError) {
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
    
    await page.waitForSelector('#main-menu', { visible: true, timeout: 10000 });
    
    const serviciosOnlineSelector = '#main-menu li.dropdown a[href="https://www.sii.cl/servicios_online/"]';
    await page.waitForSelector(serviciosOnlineSelector, { visible: true, timeout: 10000 });
    
    log('Haciendo hover en Servicios online');
    await page.hover(serviciosOnlineSelector);
    
    await page.waitForFunction(() => {
      const dropdown = document.querySelector('#main-menu li.dropdown .dropdown-menu');
      return dropdown && dropdown.style.display !== 'none';
    }, { timeout: 5000 });
    
    log('Dropdown de Servicios online desplegado');
    
    const boletasHonorariosSelector = '#main-menu .dropdown-menu a[href="https://www.sii.cl/servicios_online/1040-.html"]';
    await page.waitForSelector(boletasHonorariosSelector, { visible: true, timeout: 10000 });
    
    log('Haciendo clic en Boletas de honorarios electrónicas');
    await page.click(boletasHonorariosSelector);
    
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
 * Función para hacer clic en el botón "Consultar" (cmdconsultar124)
 ****************************************************************************************/
async function clickBotonConsultar124(page, log, errorLogPath) {
  try {
    log('Buscando botón "Consultar" con ID cmdconsultar124...');
    
    await page.waitForSelector('#cmdconsultar124', { visible: true, timeout: 15000 });
    
    log('Botón "Consultar" encontrado');
    
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
    
    await page.evaluate(() => {
      const boton = document.querySelector('#cmdconsultar124');
      if (boton) {
        boton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    
    await randomDelay(1000, 2000);
    
    let clickExitoso = false;
    
    try {
      await page.click('#cmdconsultar124');
      log('Clic realizado usando método directo');
      clickExitoso = true;
    } catch (error1) {
      log(`Método 1 falló: ${error1.message}`);
      
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
    await randomDelay(3000, 5000);
    
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
 * Función para verificar tabla y capturar screenshot si todos los valores son cero
 ****************************************************************************************/
async function verificarYCapturarTabla(page, log, errorLogPath) {
  try {
    log('Iniciando análisis de tabla de resultados del informe anual...');
    
    await page.waitForFunction(() => {
      return document.querySelector('table[width="630"][border="1"]');
    }, { timeout: 15000 });
    
    log('Tabla encontrada, procediendo con el análisis...');
    
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
    
    log(`Análisis completado. Meses analizados: ${analisisTabla.totalMesesAnalizados}`);
    
    analisisTabla.resultados.forEach((resultado, index) => {
      const status = resultado.esValorCero ? '[CERO]' : '[TIENE VALOR]';
      log(`  ${resultado.mes}: ${status} - Valor bruto: "${resultado.totalLiquidoRaw}" -> Limpio: "${resultado.totalLiquidoLimpio}"`);
    });
    
    if (analisisTabla.todosLosTotalesSonCero) {
      log('⚠️ TODOS LOS TOTALES SON CERO - Procediendo a tomar screenshot...');
      
      const rutEmpresa = RUT;
      const nombreArchivo = generarNombreArchivoScreenshot(rutEmpresa);
      const rutaScreenshot = path.join(destino, nombreArchivo);
      
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
 * Función principal
 ****************************************************************************************/
async function procesarSIIBoletas(configuracion) {
  const directorioDestino = configuracion ? configuracion.directorio : destino;
  
  if (!fs.existsSync(directorioDestino)) {
    fs.mkdirSync(directorioDestino, { recursive: true });
  }
  
  const execLogPath = path.join(directorioDestino, 'sii_exec_log.txt');
  const errorLogPath = path.join(directorioDestino, 'sii_error_log.txt');
  
  fs.writeFileSync(execLogPath, '', 'utf8');
  fs.writeFileSync(errorLogPath, '', 'utf8');
  
  const log = makeLogger(execLogPath);
  
  let browser, page;
  
  try {
    log('Iniciando navegador...');
    
    browser = await puppeteer.launch({
      headless: false,
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
    mostrarProgreso(1, 7, 'Login en el SII...');
    
    const loginExitoso = await loginSII(page, log, errorLogPath);
    if (!loginExitoso) {
      throw new Error('Login fallido');
    }
    
    await randomDelay(500, 1500);
    mostrarProgreso(2, 7, 'Navegando a boletas de honorarios...');
    
    const navegacionExitosa = await navegarABoletasHonorarios(page, log, errorLogPath);
    if (!navegacionExitosa) {
      throw new Error('Navegación a boletas de honorarios fallida');
    }
    
    await randomDelay(500, 1500);
    mostrarProgreso(3, 7, 'Accediendo a emisor de boletas...');
    
    const clickEmisorExitoso = await clickEmisorBoleta(page, log, errorLogPath);
    if (!clickEmisorExitoso) {
      throw new Error('Clic en Emisor de boleta fallido');
    }
    
    await randomDelay(500, 1500);
    mostrarProgreso(4, 7, 'Accediendo a consultas...');
    
    const clickConsultasExitoso = await clickConsultasBoletas(page, log, errorLogPath);
    if (!clickConsultasExitoso) {
      throw new Error('Clic en Consultas sobre boletas fallido');
    }
    
    await randomDelay(500, 1500);
    mostrarProgreso(5, 7, 'Accediendo a consultar boletas emitidas...');
    
    const clickConsultarExitoso = await clickConsultarBoletasEmitidas(page, log, errorLogPath);
    if (!clickConsultarExitoso) {
      throw new Error('Clic en Consultar boletas emitidas fallido');
    }
    
    await randomDelay(500, 1500);
    mostrarProgreso(6, 7, 'Generando informe anual...');
    
    const clickBoton124Exitoso = await clickBotonConsultar124(page, log, errorLogPath);
    if (!clickBoton124Exitoso) {
      throw new Error('Clic en botón Consultar124 fallido');
    }
    
    await randomDelay(500, 1500);
    mostrarProgreso(7, 7, 'Analizando resultados...');
    
    const resultadoVerificacion = await verificarYCapturarTabla(page, log, errorLogPath);
    
    log('Proceso completado exitosamente');
    log('Análisis del informe anual de boletas de honorarios finalizado');
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        PROCESO COMPLETADO                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    if (resultadoVerificacion.screenshotTomado) {
      console.log(`\n📸 Se detectaron valores en cero - Screenshot guardado:`);
      console.log(`${resultadoVerificacion.rutaArchivo}`);
    } else if (resultadoVerificacion.mesesConValor) {
      console.log(`\n✅ Se encontraron ${resultadoVerificacion.mesesConValor} meses con valores.`);
      console.log(`No se requiere screenshot.`);
    }
    
    console.log(`\n📁 Logs guardados en: ${directorioDestino}`);
    console.log(`- Ejecución: sii_exec_log.txt`);
    console.log(`- Errores: sii_error_log.txt`);
    
    const screenshotPath = path.join(directorioDestino, `sii_final_${getLocalDateTimeString().replace(/[: ]/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot final guardado en: ${screenshotPath}`);
    
    await delay(10000);
    
  } catch (error) {
    const errorMsg = `Error en procesamiento SII: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    console.error('\n❌ ' + errorMsg);
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
    const configuracion = await mostrarInterfazUsuario();
    await procesarSIIBoletas(configuracion);
    
    console.log('\n👋 Presiona cualquier tecla para salir...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 0));
    
  } catch (err) {
    console.error('\n❌ Error en la ejecución:', err.message);
    console.log('\n👋 Presiona cualquier tecla para salir...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 0));
  }
})();