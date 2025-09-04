const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class SIIScraper {
    constructor(downloadPath = './descargas') {
        // Corregir problema de barras invertidas
        this.downloadPath = path.resolve(downloadPath);
        this.browser = null;
        this.context = null;
        this.page = null;
        
        // URLs del SII
        this.urls = {
            login: 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi',
            main: 'https://misiir.sii.cl/cgi_misii/siihome.cgi'
        };
        
        // Configuración de timeouts
        this.timeouts = {
            default: 30000,
            navigation: 30000,
            download: 60000
        };
    }

    async setupBrowser() {
        try {
            console.log('🔧 Configurando navegador...');
            
            // Crear directorio de descarga si no existe
            this.ensureDownloadDirectory();

            // Lanzar browser con configuraciones optimizadas
            this.browser = await chromium.launch({
                headless: false,
                slowMo: 500,
                args: [
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });

            // Crear contexto con configuraciones mejoradas
            this.context = await this.browser.newContext({
                acceptDownloads: true,
                viewport: { width: 1366, height: 768 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });

            // Crear página
            this.page = await this.context.newPage();
            
            // Configurar timeouts
            this.page.setDefaultTimeout(this.timeouts.default);
            this.page.setDefaultNavigationTimeout(this.timeouts.navigation);

            console.log('✅ Navegador configurado correctamente');
            return true;

        } catch (error) {
            console.error('❌ Error configurando navegador:', error.message);
            return false;
        }
    }

    ensureDownloadDirectory() {
        try {
            if (!fs.existsSync(this.downloadPath)) {
                fs.mkdirSync(this.downloadPath, { recursive: true });
                console.log(`📁 Directorio creado: ${this.downloadPath}`);
            }
        } catch (error) {
            throw new Error(`No se pudo crear el directorio: ${error.message}`);
        }
    }

    async loginSII(rut, clave) {
        try {
            console.log('🌐 Accediendo al sitio del SII...');
            
            // Ir directamente a la página de login
            await this.page.goto(this.urls.login, { 
                waitUntil: 'networkidle',
                timeout: this.timeouts.navigation 
            });

            console.log('📝 Ingresando credenciales...');
            
            // Esperar a que aparezcan los campos de login
            await this.page.waitForSelector('input[name="RUT"]', { timeout: 10000 });
            
            // Limpiar y llenar RUT
            await this.page.fill('input[name="RUT"]', '');
            await this.page.fill('input[name="RUT"]', rut);
            
            // Limpiar y llenar clave
            await this.page.fill('input[name="password"]', '');
            await this.page.fill('input[name="password"]', clave);

            console.log('🔐 Enviando credenciales...');
            
            // Hacer click en el botón de ingresar
            await Promise.all([
                this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: this.timeouts.navigation }),
                this.page.click('input[type="submit"][value="Ingresar"]')
            ]);

            // Verificar si el login fue exitoso
            await this.page.waitForTimeout(2000);
            
            // Buscar indicadores de login exitoso
            const isLoggedIn = await this.isLoginSuccessful();
            
            if (!isLoggedIn) {
                await this.takeDebugScreenshot('login_failed');
                throw new Error('Login fallido - verificar credenciales');
            }

            console.log('✅ Login exitoso');
            return true;

        } catch (error) {
            console.error('❌ Error en login:', error.message);
            await this.takeDebugScreenshot('login_error');
            return false;
        }
    }

    async isLoginSuccessful() {
        try {
            // Buscar elementos que indican login exitoso
            const successIndicators = [
                'text=Boleta de Honorario',
                'text=Servicios Online',
                'text=Mi SII',
                '[href*="boleta"]',
                '[href*="honorario"]'
            ];

            for (const indicator of successIndicators) {
                const element = await this.page.$(indicator);
                if (element) {
                    console.log(`✅ Indicador de login encontrado: ${indicator}`);
                    return true;
                }
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async navigateToBoletasHonorarios() {
        try {
            console.log('📋 Navegando a Boleta de Honorario Electrónico...');

            // Intentar diferentes selectores para encontrar el enlace
            const boletaSelectors = [
                'text=Boleta de Honorario Electrónica',
                'text=Boleta de Honorario',
                'a[href*="boleta"]',
                'a[href*="honorario"]'
            ];

            let boletaLink = null;
            for (const selector of boletaSelectors) {
                try {
                    boletaLink = await this.page.$(selector);
                    if (boletaLink) {
                        console.log(`🎯 Enlace encontrado con: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!boletaLink) {
                await this.takeDebugScreenshot('boleta_link_not_found');
                throw new Error('No se encontró el enlace de Boleta de Honorario');
            }

            await boletaLink.click();
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(2000);

            console.log('🏢 Accediendo a Emisor de boletas de honorarios...');
            
            const emisorSelectors = [
                'text=Emisor de boletas de honorarios',
                'text=Emisor de boletas',
                'a[href*="emisor"]'
            ];

            let emisorLink = null;
            for (const selector of emisorSelectors) {
                try {
                    emisorLink = await this.page.$(selector);
                    if (emisorLink) {
                        console.log(`🎯 Enlace emisor encontrado con: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!emisorLink) {
                await this.takeDebugScreenshot('emisor_link_not_found');
                throw new Error('No se encontró el enlace de Emisor');
            }

            await emisorLink.click();
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(2000);

            console.log('✅ Navegación a boletas exitosa');
            return true;

        } catch (error) {
            console.error('❌ Error navegando a boletas de honorarios:', error.message);
            return false;
        }
    }

    async consultarBoletasEmitidas() {
        try {
            console.log('🔍 Accediendo a consultas sobre boleta de honorario electrónica...');

            const consultaSelectors = [
                'text=Consultar sobre boleta de honorario electrónica',
                'text=Consultar sobre boleta',
                'a[href*="consultar"]'
            ];

            const consultaLink = await this.findElementBySelectors(consultaSelectors);
            if (!consultaLink) {
                await this.takeDebugScreenshot('consulta_link_not_found');
                throw new Error('No se encontró el enlace de consulta');
            }

            await consultaLink.click();
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(2000);

            console.log('📊 Seleccionando "Consultar boletas emitidas"...');
            
            const emitidaSelectors = [
                'text=Consultar boletas emitidas',
                'text=Boletas emitidas',
                'a[href*="emitidas"]'
            ];

            const emitidaLink = await this.findElementBySelectors(emitidaSelectors);
            if (!emitidaLink) {
                await this.takeDebugScreenshot('emitidas_link_not_found');
                throw new Error('No se encontró el enlace de boletas emitidas');
            }

            await emitidaLink.click();
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(3000);

            console.log('✅ Acceso a consulta de boletas exitoso');
            return true;

        } catch (error) {
            console.error('❌ Error en consulta de boletas emitidas:', error.message);
            return false;
        }
    }

    async consultarAnualYDescargar() {
        try {
            console.log('📅 Buscando la opción de consulta anual...');

            // Buscar el botón de consultar anual (primera columna)
            const consultarSelectors = [
                'table tr:first-child td:first-child a',
                'table tbody tr:first-child td:first-child a',
                'table tr td:first-child a',
                'input[value*="Consultar"]',
                'button:has-text("Consultar")',
                'a:has-text("Consultar")'
            ];

            const consultarButton = await this.findElementBySelectors(consultarSelectors);
            if (!consultarButton) {
                await this.takeDebugScreenshot('consultar_anual_not_found');
                throw new Error('No se encontró el botón de consulta anual');
            }

            console.log('🎯 Haciendo click en consulta anual...');
            await consultarButton.click();
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(3000);

            // Intentar descarga
            return await this.downloadPDF();

        } catch (error) {
            console.error('❌ Error al consultar anual:', error.message);
            return false;
        }
    }

    async downloadPDF() {
        try {
            console.log('🖨️ Buscando opción de imprimir/PDF...');

            const imprimirSelectors = [
                'input[value*="Imprimir"]',
                'input[value*="PDF"]',
                'button:has-text("Imprimir")',
                'button:has-text("PDF")',
                'a:has-text("Imprimir")',
                'a:has-text("PDF")',
                '[onclick*="print"]',
                '[href*="pdf"]',
                'input[type="button"][value*="Imprimir"]'
            ];

            const imprimirButton = await this.findElementBySelectors(imprimirSelectors);
            if (!imprimirButton) {
                await this.takeDebugScreenshot('imprimir_not_found');
                console.log('⚠️ No se encontró botón de imprimir, generando PDF de la página...');
                return await this.generatePagePDF();
            }

            console.log('📥 Iniciando descarga...');
            
            // Configurar listener para descarga
            const downloadPromise = this.page.waitForEvent('download', { 
                timeout: this.timeouts.download 
            });

            // Hacer click en imprimir
            await imprimirButton.click();

            try {
                // Esperar descarga
                const download = await downloadPromise;
                const fileName = this.generateFileName('pdf');
                const filePath = path.join(this.downloadPath, fileName);
                
                await download.saveAs(filePath);
                console.log(`✅ PDF descargado: ${filePath}`);
                return true;

            } catch (downloadError) {
                console.log('⚠️ Descarga automática falló, generando PDF...');
                return await this.generatePagePDF();
            }

        } catch (error) {
            console.error('❌ Error en descarga:', error.message);
            return false;
        }
    }

    async generatePagePDF() {
        try {
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
            console.log(`✅ PDF generado: ${filePath}`);
            return true;

        } catch (error) {
            console.error('❌ Error generando PDF:', error.message);
            return false;
        }
    }

    async findElementBySelectors(selectors) {
        for (const selector of selectors) {
            try {
                const element = await this.page.$(selector);
                if (element) {
                    console.log(`🎯 Elemento encontrado con: ${selector}`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    generateFileName(extension) {
        const timestamp = new Date().toISOString().split('T')[0];
        const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        return `boletas_honorarios_${timestamp}_${time}.${extension}`;
    }

    async takeDebugScreenshot(name) {
        try {
            const screenshotPath = path.join(this.downloadPath, `${name}_${Date.now()}.png`);
            await this.page.screenshot({ 
                path: screenshotPath, 
                fullPage: true 
            });
            console.log(`📸 Screenshot guardado: ${screenshotPath}`);
        } catch (error) {
            console.error('Error tomando screenshot:', error.message);
        }
    }

    async runScraping(rut, clave) {
        try {
            console.log('='.repeat(60));
            console.log('🚀 INICIANDO PROCESO DE WEB SCRAPING SII');
            console.log('='.repeat(60));

            // Configurar browser
            if (!(await this.setupBrowser())) {
                throw new Error('Error configurando navegador');
            }

            // Realizar login
            if (!(await this.loginSII(rut, clave))) {
                throw new Error('Error en el login');
            }

            // Navegar a boletas de honorarios
            if (!(await this.navigateToBoletasHonorarios())) {
                throw new Error('Error navegando a boletas de honorarios');
            }

            // Consultar boletas emitidas
            if (!(await this.consultarBoletasEmitidas())) {
                throw new Error('Error en consulta de boletas emitidas');
            }

            // Consultar anual y descargar
            if (!(await this.consultarAnualYDescargar())) {
                throw new Error('Error descargando reporte anual');
            }

            console.log('='.repeat(60));
            console.log('🎉 ¡PROCESO COMPLETADO EXITOSAMENTE!');
            console.log(`📁 Archivos guardados en: ${this.downloadPath}`);
            console.log('='.repeat(60));

            return true;

        } catch (error) {
            console.error('❌ Error general:', error.message);
            await this.takeDebugScreenshot('error_general');
            return false;

        } finally {
            await this.closeBrowser();
        }
    }

    async closeBrowser() {
        if (this.browser) {
            console.log('🔒 Cerrando navegador...');
            await this.browser.close();
        }
    }
}

// Configuración
const CONFIG = {
    RUT_USUARIO: '79.978.870-5',
    CLAVE_USUARIO: '1234',
    RUTA_DESCARGA: './descargas' 
};

// Función principal
async function main() {
    console.log('📋 CONFIGURACIÓN ACTUAL:');
    console.log(`RUT: ${CONFIG.RUT_USUARIO}`);
    console.log(`Ruta de descarga: ${path.resolve(CONFIG.RUTA_DESCARGA)}`);
    console.log('-'.repeat(50));

    const scraper = new SIIScraper(CONFIG.RUTA_DESCARGA);
    const success = await scraper.runScraping(CONFIG.RUT_USUARIO, CONFIG.CLAVE_USUARIO);

    process.exit(success ? 0 : 1);
}

// Manejo de errores
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Error no manejado:', reason);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Proceso interrumpido por el usuario');
    process.exit(0);
});

// Ejecutar
if (require.main === module) {
    console.log('🔧 REQUISITOS PREVIOS:');
    console.log('1. npm install playwright');
    console.log('2. npx playwright install chromium');
    console.log('3. Modificar CONFIG con tus credenciales');
    console.log('='.repeat(50));
    
    main().catch(console.error);
}

module.exports = SIIScraper;