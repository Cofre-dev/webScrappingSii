const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Directorio de salida
const destino = process.env.DESTINO || path.join(__dirname, 'resultados_sii');

if (!fs.existsSync(destino)){
    fs.mkdirSync(destino, {recursive: true});
}

// Variable global para almacenar clientes SSE
let clients = [];

// Funciones helper optimizadas (igual que la versión rápida)
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function quickDelay(minMs = 200, maxMs = 500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((res) => setTimeout(res, ms));
}

function makeLogger(execLogPath, sendToClient = null) {
  return function log(msg) {
    console.log(msg);
    fs.appendFileSync(execLogPath, msg + '\n', 'utf8');
    
    // Enviar a cliente web si está disponible
    if (sendToClient) {
      sendToClient(msg);
    }
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

async function typeFast(page, selector, text) {
  await page.focus(selector);
  await page.evaluate((sel, txt) => {
    const element = document.querySelector(sel);
    element.value = '';
    element.value = txt;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, text);
}

async function loginSII(page, log, errorLogPath, rutUsuario, claveUsuario) {
  try {
    log('🔐 Iniciando proceso de login en SII...');
    
    await page.goto('https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi', {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
    
    log('✅ Página de login cargada');
    
    await page.waitForSelector('#rutcntr', { visible: true, timeout: 5000 });
    await page.waitForSelector('#clave', { visible: true, timeout: 5000 });
    await page.waitForSelector('#bt_ingresar', { visible: true, timeout: 5000 });
    
    log('✅ Elementos de login encontrados');
    
    log(`📝 Escribiendo RUT: ${rutUsuario}`);
    await typeFast(page, '#rutcntr', rutUsuario);
    
    await quickDelay(100, 200);
    
    log('📝 Escribiendo clave...');
    await typeFast(page, '#clave', claveUsuario);
    
    await quickDelay(100, 200);
    
    log('🖱️ Haciendo clic en botón Ingresar');
    await page.click('#bt_ingresar');
    
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 });
      log('✅ Login completado - navegación detectada');
    } catch (navError) {
      try {
        await page.waitForSelector('#main-menu', { timeout: 5000 });
        log('✅ Login completado - elementos de página principal detectados');
      } catch (elementError) {
        throw new Error('No se pudo verificar el login exitoso');
      }
    }
    
    return true;
  } catch (error) {
    const errorMsg = `❌ Error en login SII: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

async function navegarABoletasHonorarios(page, log, errorLogPath) {
  try {
    log('🧭 Navegando al menú de Servicios online...');
    
    await page.waitForSelector('#main-menu', { visible: true, timeout: 5000 });
    
    const serviciosOnlineSelector = '#main-menu li.dropdown a[href="https://www.sii.cl/servicios_online/"]';
    await page.waitForSelector(serviciosOnlineSelector, { visible: true, timeout: 5000 });
    
    log('🖱️ Haciendo hover en Servicios online');
    await page.hover(serviciosOnlineSelector);
    
    await page.waitForFunction(() => {
      const dropdown = document.querySelector('#main-menu li.dropdown .dropdown-menu');
      return dropdown && dropdown.style.display !== 'none';
    }, { timeout: 3000 });
    
    log('📋 Dropdown desplegado');
    
    const boletasHonorariosSelector = '#main-menu .dropdown-menu a[href="https://www.sii.cl/servicios_online/1040-.html"]';
    await page.waitForSelector(boletasHonorariosSelector, { visible: true, timeout: 5000 });
    
    log('🖱️ Haciendo clic en Boletas de honorarios electrónicas');
    await page.click(boletasHonorariosSelector);
    
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 });
    log('✅ Página de Boletas de honorarios electrónicas cargada');
    
    return true;
  } catch (error) {
    const errorMsg = `❌ Error navegando a boletas de honorarios: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

async function clickRapido(page, textoBuscar, log, nombreElemento) {
  try {
    log(`🔍 Buscando y haciendo clic en "${nombreElemento}"...`);
    
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
    const errorMsg = `❌ Error haciendo clic en ${nombreElemento}: ${error.message}`;
    log(errorMsg);
    return false;
  }
}

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

async function verificarYCapturarTabla(page, log, errorLogPath, rutUsuario) {
  try {
    log('📊 Analizando tabla de resultados...');
    
    await page.waitForFunction(() => {
      return document.querySelector('table[width="630"][border="1"]');
    }, { timeout: 8000 });
    
    log('✅ Tabla encontrada, analizando...');
    
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
    
    log(`📈 Análisis completado. Meses: ${analisisTabla.totalMesesAnalizados}`);
    
    if (analisisTabla.todosLosTotalesSonCero) {
      log('⚠️ TODOS LOS TOTALES SON CERO - Tomando screenshot...');
      
      const nombreArchivo = generarNombreArchivoScreenshot(rutUsuario);
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
    const errorMsg = `❌ Error verificando tabla: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return { screenshotTomado: false, error: errorMsg };
  }
}

async function clickBotonConsultarRapido(page, log, errorLogPath, tipoConsulta = 'validar_anual') {
  try {
    log(`🔍 Buscando botón "Consultar" para ${tipoConsulta}...`);
    
    await page.waitForSelector('#cmdconsultar124', { visible: true, timeout: 5000 });
    
    log('✅ Botón encontrado, haciendo clic...');
    
    let clickExitoso = false;
    
    try {
      await page.click('#cmdconsultar124');
      clickExitoso = true;
    } catch (error1) {
      try {
        await page.evaluate(() => {
          document.querySelector('#cmdconsultar124').click();
        });
        clickExitoso = true;
      } catch (error2) {
        try {
          await page.evaluate((tipo) => {
            if (typeof presionaBoton === 'function') {
              presionaBoton(tipo);
            }
          }, tipoConsulta);
          clickExitoso = true;
        } catch (error3) {
          log(`❌ Todos los métodos fallaron`);
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
    const errorMsg = `❌ Error haciendo clic en botón consultar: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return false;
  }
}

// Función principal del proceso SII
async function procesarSIIConCredenciales(rutUsuario, claveUsuario, sendProgressToClient) {
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true });
  }
  
  const timestamp = getLocalDateTimeString().replace(/[: ]/g, '_');
  const execLogPath = path.join(destino, `sii_exec_log_${timestamp}.txt`);
  const errorLogPath = path.join(destino, `sii_error_log_${timestamp}.txt`);
  
  fs.writeFileSync(execLogPath, '', 'utf8');
  fs.writeFileSync(errorLogPath, '', 'utf8');
  
  const log = makeLogger(execLogPath, sendProgressToClient);
  
  let browser, page;
  const tiempoInicio = Date.now();
  
  try {
    log('🚀 Iniciando proceso SII...');
    
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
    
    log('✅ Navegador iniciado');
    
    // FLUJO BOLETAS EMITIDAS
    log('=== 📝 INICIANDO CONSULTA BOLETAS EMITIDAS ===');
    
    const loginExitoso = await loginSII(page, log, errorLogPath, rutUsuario, claveUsuario);
    if (!loginExitoso) throw new Error('Login fallido');
    
    await quickDelay();
    
    const navegacionExitosa = await navegarABoletasHonorarios(page, log, errorLogPath);
    if (!navegacionExitosa) throw new Error('Navegación fallida');
    
    await quickDelay();
    
    const paso3 = await clickRapido(page, 'emisor de boleta de honorarios', log, 'Emisor de boleta');
    if (!paso3) throw new Error('Clic en Emisor fallido');
    
    await quickDelay();
    
    const paso4 = await clickRapido(page, 'consultas sobre boletas de honorarios', log, 'Consultas sobre boletas');
    if (!paso4) throw new Error('Clic en Consultas fallido');
    
    await quickDelay();
    
    const paso5 = await clickRapido(page, 'consultar boletas emitidas', log, 'Consultar boletas emitidas');
    if (!paso5) throw new Error('Clic en Consultar emitidas fallido');
    
    await quickDelay();
    
    const paso6 = await clickBotonConsultarRapido(page, log, errorLogPath, 'validar_anual');
    if (!paso6) throw new Error('Botón consultar fallido');
    
    await quickDelay();
    
    const resultadoVerificacion = await verificarYCapturarTabla(page, log, errorLogPath, rutUsuario);
    
    if (resultadoVerificacion.screenshotTomado) {
      log(`✅ Screenshot emitidas guardado`);
    } else {
      log(`✅ Boletas emitidas procesadas - ${resultadoVerificacion.mesesConValor || 0} meses con valores`);
    }
    
    // FLUJO BOLETAS RECIBIDAS
    log('=== 📨 INICIANDO CONSULTA BOLETAS RECIBIDAS ===');
    
    await quickDelay();
    
    // Navegar a consultas
    log('🧭 Navegando a página de consultas...');
    await page.goto('https://www.sii.cl/servicios_online/1040-1287.html', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    log('✅ Página de consultas cargada');
    await quickDelay();
    
    // Click en consultar boletas recibidas
    log('🔍 Buscando "Consultar boletas recibidas"...');
    
    const clickRecibidasExitoso = await page.evaluate(() => {
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
    
    if (!clickRecibidasExitoso) {
      await page.evaluate(() => {
        if (typeof linkVisita === 'function') {
          linkVisita('https://loa.sii.cl/cgi_IMT/TMBCOC_MenuConsultasContribRec.cgi?dummy=1461943244650', 'Consultar_boletas_recibidas');
        }
      });
    }
    
    log('✅ Clic en "Consultar boletas recibidas" realizado');
    await quickDelay(1000, 2000);
    
    // Botón consultar recibidas
    const consultarRecibidasExitoso = await clickBotonConsultarRapido(page, log, errorLogPath, 'validar_anual_rec');
    if (consultarRecibidasExitoso) {
      
      await quickDelay();
      
      // Screenshot final
      log('📸 Capturando screenshot de boletas recibidas...');
      
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
      
      const nombreArchivo = `boletas_recibidas_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.png`;
      const rutaCompleta = path.join(rutaCarpeta, nombreArchivo);
      
      await quickDelay(500, 1000);
      
      await page.screenshot({ 
        path: rutaCompleta, 
        fullPage: true 
      });
      
      log(`📸 Screenshot recibidas guardado: ${rutaCompleta}`);
      log(`📁 Directorio: ${nombreCarpeta}`);
    }
    
    const tiempoTotal = ((Date.now() - tiempoInicio) / 1000).toFixed(1);
    log(`🏁 PROCESO COMPLETADO EN ${tiempoTotal} SEGUNDOS`);
    log(`📂 Resultados guardados en: ${destino}`);
    
    await delay(3000);
    
    return { success: true, tiempo: tiempoTotal, directorio: destino };
    
  } catch (error) {
    const errorMsg = `❌ Error en procesamiento SII: ${error.message}`;
    log(errorMsg);
    writeErrorLog(errorLogPath, errorMsg);
    return { success: false, error: errorMsg };
  } finally {
    if (browser) {
      await browser.close();
      log('🔒 Navegador cerrado');
    }
  }
}

// RUTAS DEL SERVIDOR WEB

// Página principal con formulario
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🚀 SII Consultor Automático</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #333;
        }
        
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
            text-align: center;
        }
        
        .logo {
            font-size: 48px;
            margin-bottom: 10px;
        }
        
        h1 {
            color: #333;
            margin-bottom: 30px;
            font-size: 24px;
            font-weight: 600;
        }
        
        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #555;
            font-size: 14px;
        }
        
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e5e9;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s ease;
            background: #f8f9fa;
        }
        
        input[type="text"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .submit-btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 10px;
        }
        
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .submit-btn:active {
            transform: translateY(0);
        }
        
        .info {
            margin-top: 20px;
            padding: 15px;
            background: #e3f2fd;
            border-radius: 10px;
            font-size: 14px;
            color: #1565c0;
        }
        
        .features {
            margin-top: 20px;
            text-align: left;
            font-size: 14px;
            color: #666;
        }
        
        .features ul {
            list-style: none;
            padding: 0;
        }
        
        .features li {
            padding: 5px 0;
        }
        
        .features li::before {
            content: "✅ ";
            margin-right: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🚀</div>
        <h1>SII Consultor Automático</h1>
        
        <form action="/procesar" method="POST">
            <div class="form-group">
                <label for="rut">RUT (con puntos y guión):</label>
                <input type="text" id="rut" name="rut" placeholder="12.345.678-9" required>
            </div>
            
            <div class="form-group">
                <label for="clave">Clave SII:</label>
                <input type="password" id="clave" name="clave" placeholder="Ingresa tu clave" required>
            </div>
            
            <button type="submit" class="submit-btn">
                Iniciar Consulta
            </button>
        </form>
        
        <div class="info">
            <strong>📊 Proceso automático:</strong><br>
            • Consulta boletas emitidas<br>
            • Consulta boletas recibidas<br>
            • Genera screenshots automáticos<br>
            • ⚡ Proceso ultra rápido (~30 segundos)
        </div>
    </div>
</body>
</html>
  `);
});

// Página de proceso con progreso en tiempo real
app.post('/procesar', (req, res) => {
  const { rut, clave } = req.body;
  
  if (!rut || !clave) {
    return res.status(400).send('RUT y clave son requeridos');
  }
  
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔄 Procesando Consulta SII</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #333;
        }
        
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 600px;
            text-align: center;
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        h1 {
            color: #333;
            margin-bottom: 30px;
            font-size: 24px;
        }
        
        .status {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            max-height: 400px;
            overflow-y: auto;
            border: 2px solid #e9ecef;
        }
        
        .info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-size: 14px;
            color: #1565c0;
        }
        
        .back-btn {
            padding: 10px 20px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
        }
        
        .back-btn:hover {
            background: #5a6268;
        }
        
        .progress-line {
            margin: 5px 0;
            padding: 3px 0;
        }
        
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .warning { color: #ffc107; }
        .info-text { color: #17a2b8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>🔄 Procesando Consulta SII</h1>
        
        <div class="info">
            <strong>RUT:</strong> ${rut}<br>
            <strong>Estado:</strong> Ejecutando proceso automático...<br>
            <strong>Tiempo estimado:</strong> 20-40 segundos
        </div>
        
        <div class="status" id="status">
            <div class="progress-line">⏳ Iniciando proceso...</div>
        </div>
        
        <a href="/" class="back-btn">← Volver al inicio</a>
    </div>

    <script>
        const eventSource = new EventSource('/progress');
        const statusDiv = document.getElementById('status');
        
        eventSource.onmessage = function(event) {
            const message = event.data;
            const div = document.createElement('div');
            div.className = 'progress-line';
            
            // Agregar colores según el tipo de mensaje
            if (message.includes('✅')) {
                div.className += ' success';
            } else if (message.includes('❌')) {
                div.className += ' error';
            } else if (message.includes('⚠️')) {
                div.className += ' warning';
            } else if (message.includes('🔐') || message.includes('🧭') || message.includes('📊')) {
                div.className += ' info-text';
            }
            
            div.textContent = message;
            statusDiv.appendChild(div);
            statusDiv.scrollTop = statusDiv.scrollHeight;
            
            // Si el proceso terminó
            if (message.includes('🏁 PROCESO COMPLETADO')) {
                document.querySelector('.spinner').style.display = 'none';
                document.querySelector('h1').innerHTML = '✅ Consulta Completada';
                
                // Opcional: redirigir después de un tiempo
                setTimeout(() => {
                    eventSource.close();
                }, 5000);
            }
        };
        
        eventSource.onerror = function(event) {
            console.error('Error en EventSource:', event);
        };
    </script>
</body>
</html>
  `);
  
  // Iniciar el proceso SII en segundo plano
  setTimeout(() => {
    procesarSIIConCredenciales(rut, clave, (message) => {
      // Enviar mensajes a todos los clientes conectados
      clients.forEach(client => {
        client.write(`data: ${message}\n\n`);
      });
    });
  }, 1000);
});

// Server-Sent Events para progreso en tiempo real
app.get('/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Agregar cliente a la lista
  clients.push(res);
  
  // Enviar mensaje inicial
  res.write(`data: 🚀 Conexión establecida - Iniciando proceso...\n\n`);
  
  // Limpiar cliente cuando se desconecte
  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🚀 SII Consultor Automático iniciado');
  console.log('=====================================');
  console.log(`🌐 Servidor corriendo en: http://localhost:${PORT}`);
  console.log(`📂 Resultados se guardan en: ${destino}`);
  console.log('');
  console.log('✨ Características:');
  console.log('  • Interfaz web intuitiva');
  console.log('  • Proceso en tiempo real');
  console.log('  • Login seguro');
  console.log('  • Consultas automáticas');
  console.log('  • Screenshots inteligentes');
  console.log('  • Ultra rápido (~30 segundos)');
  console.log('');
  console.log('🔗 Abre tu navegador y ve a: http://localhost:3000');
});