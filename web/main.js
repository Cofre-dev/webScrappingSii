const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class SIIHumanBot {
    constructor(downloadPath = './descargas') {
        this.downloadPath = path.resolve(downloadPath);
        this.browser = null;
        this.context = null;
        this.page = null;
        
        // URLs del SII
        this.urls = {
            login: 'https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html'
        };
        
        // Configuración humana
        this.humanConfig = {
            typingDelay: { min: 50, max: 150 },
            mouseDelay: { min: 100, max: 300 },
            readingTime: { min: 1000, max: 3000 },
            navigationDelay: { min: 2000, max: 4000 }
        };
    }

    // Métodos para simular comportamiento humano
    async humanDelay(type = 'default') {
        const delays = this.humanConfig[type + 'Delay'] || this.humanConfig.readingTime;
        const randomDelay = Math.floor(Math.random() * (delays.max - delays.min + 1)) + delays.min;
        await this.page.waitForTimeout(randomDelay);
    }

    async humanType(selector, text) {
        const element = await this.page.locator(selector);
        await element.click();
        await this.humanDelay('typing');
        await element.fill('');
        await this.humanDelay('typing');
        
        for (const char of text) {
            await element.type(char);
            await this.page.waitForTimeout(Math.random() * 100 + 50);
        }
        await this.humanDelay('typing');
    }

    async setupBrowser() {
        try {
            console.log('🤖 Configurando bot humano...');
            
            this.ensureDownloadDirectory();

            this.browser = await chromium.launch({
                headless: false,
                slowMo: 500,
                args: [
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            this.context = await this.browser.newContext({
                acceptDownloads: true,
                viewport: { width: 1366, height: 768 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                extraHTTPHeaders: {
                    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8'
                }
            });

            this.page = await this.context.newPage();
            this.page.setDefaultTimeout(60000);
            this.page.setDefaultNavigationTimeout(60000);

            console.log('✅ Bot humano configurado correctamente');
            return true;

        } catch (error) {
            console.error('❌ Error configurando bot:', error.message);
            return false;
        }
    }

    ensureDownloadDirectory() {
        if (!fs.existsSync(this.downloadPath)) {
            fs.mkdirSync(this.downloadPath, { recursive: true });
            console.log(`📁 Directorio creado: ${this.downloadPath}`);
        }
    }

    async smartLogin(rut, clave) {
        try {
            console.log('🌐 Navegando a la página de login del SII...');
            
            await this.page.goto(this.urls.login, { waitUntil: 'networkidle', timeout: 60000 });
            await this.humanDelay('reading');
            await this.takeDebugScreenshot('01_pagina_login');

            // Analizar la página antes
            // Aquí deberías agregar el resto del proceso de login, por ejemplo:
            // await this.humanType('input[name="rut"]', rut);
            // await this.humanType('input[name="clave"]', clave);
            // await this.page.click('input[type="submit"]');
            // await this.humanDelay('navigation');
            // return await this.verifyLoginSuccess();

            // Por ahora, solo retorna false para evitar el error de bloque try sin catch
            return false;
        } catch (error) {
            console.error('❌ Error en smartLogin:', error.message);
            return false;
        }
    }
        
    async verifyLoginSuccess() {
        try {
            console.log('🔍 Verificando acceso exitoso...');
            await this.page.waitForTimeout(3000);

            // Verificar URL para confirmar primero
            const currentUrl = this.page.url();
            console.log(`📍 URL actual: ${currentUrl}`);
            
            // URLs que indican login exitoso
            if (currentUrl.includes('misiir.sii.cl') || 
                currentUrl.includes('paginatributario.sii.cl') || 
                currentUrl.includes('homer.sii.cl')) {
                console.log('✅ URL indica login exitoso');
                return true;
            }

            // Verificar si hay errores de login
            const errorSelectors = [
                'text=RUT y/o clave incorrectos',
                'text=Error de autenticación',
                'text=credenciales incorrectas',
                '.error',
                '.mensaje-error',
                'text=Usuario no válido'
            ];

            for (const selector of errorSelectors) {
                try {
                    if (await this.page.locator(selector).first().isVisible({ timeout: 1000 })) {
                        console.log(`❌ Error de login detectado: ${selector}`);
                        return false;
                    }
                } catch (e) {
                    // Continúar si el selector no existe
                    continue;
                }
            }

            // Buscar indicadores de éxito más específicos (usando .first() para evitar conflictos)
            const successSelectors = [
                'text=Bienvenido',
                'a:has-text("Ingresar a Mi Sii")', // Este aparece cuando el login es exitoso
                'text=Servicios online',
                'text=Honorarios',
                'a[href*="misiir.sii.cl"]', // Enlaces a Mi SII indican éxito
                'a[href*="honorarios"]',
                'a[href*="boleta"]'
            ];
            
            for (const selector of successSelectors) {
                try {
                    if (await this.page.locator(selector).first().isVisible({ timeout: 2000 })) {
                        console.log(`✅ Indicador de éxito encontrado: ${selector}`);
                        return true;
                    }
                } catch (e) {
                    // Continúar si el selector no existe
                    continue;
                }
            }

            // Si estamos en homer.sii.cl pero no encontramos indicadores específicos,
            // aún así es un login exitoso
            if (currentUrl.includes('homer.sii.cl')) {
                console.log('✅ Login exitoso confirmado por URL homer.sii.cl');
                return true;
            }

            return false;
        } catch (error) {
            console.log('⚠️ Error verificando login:', error.message);
            // Si hay error pero estamos en una URL del SII, probablemente es exitoso
            const currentUrl = this.page.url();
            if (currentUrl.includes('sii.cl') && !currentUrl.includes('AUT2000')) {
                console.log('✅ Login probablemente exitoso basado en URL');
                return true;
            }
            return false;
        }
    }

    async findAndClickElement(selectors, description, timeout = 10000) {
        console.log(`🔍 Buscando: ${description}`);
        
        for (const selector of selectors) {
            try {
                console.log(`   Probando selector: ${selector}`);
                const element = this.page.locator(selector);
                
                if (await element.isVisible({ timeout: 2000 })) {
                    console.log(`✅ Elemento encontrado: ${selector}`);
                    await this.humanDelay('mouse');
                    await element.click();
                    await this.page.waitForLoadState('networkidle', { timeout: 15000 });
                    await this.humanDelay('navigation');
                    return true;
                }
            } catch (error) {
                console.log(`   ⚠️ Selector no funciona: ${selector}`);
                continue;
            }
        }
        
        console.log(`❌ No se encontró: ${description}`);
        return false;
    }

    async hoverAndClick(hoverSelectors, clickSelectors, description) {
        console.log(`🖱️ Navegando por hover: ${description}`);
        
        for (const hoverSelector of hoverSelectors) {
            try {
                const hoverElement = this.page.locator(hoverSelector);
                if (await hoverElement.isVisible({ timeout: 2000 })) {
                    console.log(`✅ Elemento hover encontrado: ${hoverSelector}`);
                    await hoverElement.hover();
                    await this.humanDelay('mouse');
                    
                    // Intentar click en submenu
                    for (const clickSelector of clickSelectors) {
                        try {
                            const clickElement = this.page.locator(clickSelector);
                            if (await clickElement.isVisible({ timeout: 3000 })) {
                                console.log(`✅ Submenu encontrado: ${clickSelector}`);
                                await clickElement.click();
                                await this.page.waitForLoadState('networkidle', { timeout: 15000 });
                                await this.humanDelay('navigation');
                                return true;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return false;
    }

    async navigateAndDownload() {
        try {
            console.log('📋 Iniciando navegación a Boleta de Honorarios...');
            await this.humanDelay('reading');
            await this.takeDebugScreenshot('04_inicio_navegacion');

            // Primero, analizar la página para ver qué elementos están disponibles
            await this.debugPageElements();

            // PASO 1: Buscar acceso a boletas de honorarios
            console.log('\n🎯 PASO 1: Buscando acceso a boletas de honorarios...');
            
            // Múltiples estrategias para encontrar boletas de honorarios
            const boletaStrategies = [
                // Estrategia 1: Hover en servicios online
                async () => {
                    const hoverSelectors = [
                        'a:has-text("Servicios online")',
                        'a:has-text("Servicios")',
                        'li:has-text("Servicios")',
                        'text=Servicios online'
                    ];
                    const clickSelectors = [
                        'a:has-text("Boleta de Honorarios Electrónica")',
                        'a:has-text("Boleta de Honorarios")',
                        'a:has-text("Honorarios")',
                        'a[href*="honorarios"]',
                        'a[href*="boleta"]'
                    ];
                    return await this.hoverAndClick(hoverSelectors, clickSelectors, "Servicios Online -> Boletas");
                },
                
                // Estrategia 2: Click directo en enlaces
                async () => {
                    const selectors = [
                        'a:has-text("Boleta de Honorarios Electrónica")',
                        'a:has-text("Boleta de Honorarios")',
                        'a:has-text("Honorarios Electrónicos")',
                        'a[href*="honorarios"]',
                        'a[href*="boleta"]',
                        'text=Boleta de Honorarios'
                    ];
                    return await this.findAndClickElement(selectors, "Boletas de Honorarios directamente");
                },
                
                // Estrategia 3: Buscar en menús principales
                async () => {
                    const selectors = [
                        'text=Mi SII',
                        'text=Servicios Tributarios',
                        'text=Tributario',
                        'a:has-text("Contribuyentes")'
                    ];
                    return await this.findAndClickElement(selectors, "Menú principal");
                }
            ];

            let navigationSuccess = false;
            for (let i = 0; i < boletaStrategies.length; i++) {
                console.log(`\n📍 Intentando estrategia ${i + 1}...`);
                try {
                    if (await boletaStrategies[i]()) {
                        navigationSuccess = true;
                        await this.takeDebugScreenshot(`05_estrategia_${i + 1}_exitosa`);
                        break;
                    }
                } catch (error) {
                    console.log(`⚠️ Estrategia ${i + 1} falló:`, error.message);
                }
                await this.takeDebugScreenshot(`05_estrategia_${i + 1}_fallida`);
            }

            if (!navigationSuccess) {
                throw new Error('No se pudo acceder a la sección de boletas de honorarios');
            }

            // PASO 2: Buscar consultas
            console.log('\n🎯 PASO 2: Buscando sección de consultas...');
            const consultaSuccess = await this.findAndClickElement([
                'a:has-text("Consultar sobre boleta de honorario electrónica")',
                'a:has-text("Consultar boletas")',
                'a:has-text("Consultas")',
                'text=Consultar',
                'a[href*="consulta"]'
            ], "Consultas de boletas");

            if (!consultaSuccess) {
                console.log('⚠️ No se encontró sección de consultas, continuando...');
            } else {
                await this.takeDebugScreenshot('06_consultas');
            }

            // PASO 3: Buscar boletas emitidas
            console.log('\n🎯 PASO 3: Buscando boletas emitidas...');
            const emitidasSuccess = await this.findAndClickElement([
                'a:has-text("Consultar boletas emitidas")',
                'a:has-text("Boletas emitidas")',
                'a:has-text("Emitidas")',
                'text=Boletas emitidas',
                'a[href*="emitidas"]'
            ], "Boletas emitidas");

            if (!emitidasSuccess) {
                console.log('⚠️ No se encontró boletas emitidas, buscando alternativas...');
            } else {
                await this.takeDebugScreenshot('07_boletas_emitidas');
            }

            // PASO 4: Buscar consulta por período
            console.log('\n🎯 PASO 4: Buscando consulta por período...');
            const consultaAnualSuccess = await this.findAndClickElement([
                'a:has-text("Consultar")',
                'input[value="Consultar"]',
                'button:has-text("Consultar")',
                'a:has-text("Ver")',
                'a:has-text("Período")'
            ], "Consulta anual/período");

            if (consultaAnualSuccess) {
                await this.takeDebugScreenshot('08_despues_consulta');
                return await this.downloadPDF();
            } else {
                console.log('⚠️ No se encontró consulta específica, intentando descarga directa...');
                return await this.downloadPDF();
            }

        } catch (error) {
            console.error('❌ Error en navegación:', error.message);
            await this.takeDebugScreenshot('error_navegacion_completa');
            
            // Intentar descarga de emergencia de lo que esté visible
            console.log('🚨 Intentando descarga de emergencia...');
            return await this.downloadPDF();
        }
    }

    async debugPageElements() {
        try {
            console.log('\n🔍 ANÁLISIS DE PÁGINA ACTUAL:');
            console.log(`📍 URL: ${this.page.url()}`);
            
            // Buscar todos los enlaces visibles
            const links = await this.page.locator('a').all();
            console.log(`🔗 Enlaces encontrados: ${links.length}`);
            
            // Buscar enlaces relacionados con honorarios/boletas
            const relevantLinks = await this.page.locator('a').evaluateAll(links => {
                return links
                    .filter(link => {
                        const text = link.textContent?.toLowerCase() || '';
                        const href = link.href?.toLowerCase() || '';
                        return text.includes('honorario') || text.includes('boleta') || 
                               text.includes('servicio') || href.includes('honorario') || 
                               href.includes('boleta');
                    })
                    .map(link => ({
                        text: link.textContent?.trim(),
                        href: link.href
                    }));
            });
            
            console.log('🎯 Enlaces relevantes encontrados:');
            relevantLinks.forEach((link, index) => {
                console.log(`  ${index + 1}. "${link.text}" -> ${link.href}`);
            });
            
        } catch (error) {
            console.log('⚠️ Error en análisis de página:', error.message);
        }
    }

    async downloadPDF() {
        try {
            console.log('🖨️ Buscando opciones de descarga/impresión...');
            await this.humanDelay('reading');
            await this.takeDebugScreenshot('09_antes_descarga');
            
            // Múltiples estrategias de descarga
            const downloadStrategies = [
                // Estrategia 1: Botón de imprimir
                async () => {
                    const selectors = [
                        'input[value="Imprimir"]',
                        'button:has-text("Imprimir")',
                        'a:has-text("Imprimir")',
                        'input[type="button"][value*="Impr"]'
                    ];
                    
                    for (const selector of selectors) {
                        const element = this.page.locator(selector);
                        if (await element.isVisible({ timeout: 2000 })) {
                            console.log('📥 Iniciando descarga automática...');
                            const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });
                            await element.click();
                            
                            try {
                                const download = await downloadPromise;
                                const fileName = this.generateFileName('pdf');
                                const filePath = path.join(this.downloadPath, fileName);
                                await download.saveAs(filePath);
                                console.log(`✅ PDF descargado: ${filePath}`);
                                return true;
                            } catch (downloadError) {
                                console.log('⚠️ No se descargó archivo, continuando...');
                                return false;
                            }
                        }
                    }
                    return false;
                },
                
                // Estrategia 2: Enlaces de descarga
                async () => {
                    const selectors = [
                        'a:has-text("Descargar")',
                        'a:has-text("PDF")',
                        'a[href*=".pdf"]',
                        'a[download]'
                    ];
                    
                    for (const selector of selectors) {
                        const element = this.page.locator(selector);
                        if (await element.isVisible({ timeout: 2000 })) {
                            await element.click();
                            await this.humanDelay('navigation');
                            return true;
                        }
                    }
                    return false;
                },
                
                // Estrategia 3: Generar PDF de la página
                async () => {
                    return await this.generatePagePDF();
                }
            ];

            for (let i = 0; i < downloadStrategies.length; i++) {
                console.log(`\n📥 Intentando estrategia de descarga ${i + 1}...`);
                try {
                    if (await downloadStrategies[i]()) {
                        console.log(`✅ Descarga exitosa con estrategia ${i + 1}`);
                        return true;
                    }
                } catch (error) {
                    console.log(`⚠️ Estrategia ${i + 1} falló:`, error.message);
                }
            }

            return false;

        } catch (error) {
            console.error('❌ Error en descarga:', error.message);
            return await this.generatePagePDF();
        }
    }

    async generatePagePDF() {
        try {
            console.log('📄 Generando PDF de la página actual...');
            const pdfBuffer = await this.page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20px',
                    right: '20px', 
                    bottom: '20px',
                    left: '20px'
                }
            });
            
            const fileName = this.generateFileName('pdf');
            const filePath = path.join(this.downloadPath, fileName);
            
            fs.writeFileSync(filePath, pdfBuffer);
            console.log(`✅ PDF generado exitosamente: ${filePath}`);
            return true;
            
        } catch (error) {
            console.error('❌ Error generando PDF:', error.message);
            return false;
        }
    }

    generateFileName(extension) {
        const now = new Date();
        const timestamp = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        return `boletas_honorarios_${timestamp}_${time}.${extension}`;
    }

    async takeDebugScreenshot(name) {
        try {
            const screenshotPath = path.join(this.downloadPath, `debug_${name}_${Date.now()}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Screenshot: ${screenshotPath}`);
        } catch (error) {
            console.log('⚠️ Error screenshot:', error.message);
        }
    }

    async runAutomaticProcess(rut, clave) {
        try {
            console.log('='.repeat(70));
            console.log('🤖 INICIANDO BOT AUTOMÁTICO PARA SII');
            console.log('='.repeat(70));

            if (!(await this.setupBrowser())) {
                throw new Error('Error configurando bot');
            }

            console.log('🔐 FASE 1: AUTENTICACIÓN AUTOMÁTICA');
            console.log('-'.repeat(50));
            if (!(await this.smartLogin(rut, clave))) {
                throw new Error('Error en autenticación automática');
            }

            console.log('\n🚀 FASE 2: NAVEGACIÓN Y DESCARGA AUTOMÁTICA');
            console.log('-'.repeat(50));
            if (!(await this.navigateAndDownload())) {
                console.log('⚠️ Navegación no completamente exitosa, pero continuando...');
            }

            console.log('\n' + '='.repeat(70));
            console.log('🎉 ¡PROCESO AUTOMÁTICO COMPLETADO!');
            console.log('🤖 El bot ejecutó la secuencia disponible');
            console.log(`📁 Archivos guardados en: ${this.downloadPath}`);
            console.log('='.repeat(70));

            return true;

        } catch (error) {
            console.error('❌ Error en proceso automático:', error.message);
            await this.takeDebugScreenshot('error_proceso_completo');
            return false;

        } finally {
            // Mantener el navegador abierto para debugging
            console.log('🔍 Navegador permanece abierto para debugging...');
            console.log('🔍 Presiona Ctrl+C para cerrar el bot');
            
            // Esperar input del usuario antes de cerrar
            await this.waitForUserInput();
            await this.closeBrowser();
        }
    }

    async waitForUserInput() {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question('Presiona Enter para cerrar el navegador...', () => {
                rl.close();
                resolve();
            });
        });
    }

    async closeBrowser() {
        if (this.browser) {
            console.log('🔒 Cerrando navegador...');
            await this.page.waitForTimeout(2000);
            await this.browser.close();
        }
    }
}

// CONFIGURACIÓN - MODIFICA AQUÍ
const CONFIG = {
    RUT_USUARIO: '79.978.870-5',       // 🔐 Tu RUT
    CLAVE_USUARIO: '1234',             // 🔐 Tu clave del SII  
    RUTA_DESCARGA: './descargas'       // 📁 Carpeta de descarga
};

async function main() {
    console.log('🤖 CONFIGURACIÓN DEL BOT AUTOMÁTICO:');
    console.log(`👤 RUT: ${CONFIG.RUT_USUARIO}`);
    console.log(`📁 Descargas: ${path.resolve(CONFIG.RUTA_DESCARGA)}`);
    console.log('🔐 Clave: [CONFIGURADA]');
    console.log('-'.repeat(50));
    console.log('🎯 OBJETIVO: Automatizar completamente el proceso SII');
    console.log('🤖 MÉTODO: Bot que simula comportamiento humano');
    console.log('-'.repeat(50));
    
    const bot = new SIIHumanBot(CONFIG.RUTA_DESCARGA);
    const success = await bot.runAutomaticProcess(CONFIG.RUT_USUARIO, CONFIG.CLAVE_USUARIO);

    process.exit(success ? 0 : 1);
}

// Manejo de errores
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Error no controlado:', reason);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Bot detenido por el usuario');
    process.exit(0);
});

// Ejecutar bot
if (require.main === module) {
    console.log('🤖 BOT AUTOMÁTICO PARA SII - VERSIÓN MEJORADA');
    console.log('📋 REQUISITOS:');
    console.log('1. npm install playwright');
    console.log('2. npx playwright install chromium');
    console.log('3. Configurar credenciales en CONFIG');
    console.log('='.repeat(50));
    
    main().catch(console.error);
}
    

module.exports = SIIHumanBot;