import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import os

class SIIScraper:
    def __init__(self, download_path="/ruta/generica/descargas"):
        """
        Inicializa el scraper del SII
        
        Args:
            download_path (str): Ruta donde se guardarán los PDFs descargados
        """
        self.download_path = download_path
        self.driver = None
        self.wait = None
        
    def setup_driver(self):
        """Configura el driver de Chrome con las opciones necesarias"""
        chrome_options = Options()
        
        # Configuraciones para descargas
        prefs = {
            "download.default_directory": self.download_path,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "plugins.always_open_pdf_externally": True,
            "profile.default_content_settings.popups": 0
        }
        chrome_options.add_experimental_option("prefs", prefs)
        
        # Opciones adicionales (descomenta si necesitas modo headless)
        # chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        
        # Inicializar driver
        # Asegúrate de tener chromedriver instalado y en PATH
        self.driver = webdriver.Chrome(options=chrome_options)
        self.wait = WebDriverWait(self.driver, 20)
        
        # Crear directorio de descarga si no existe
        os.makedirs(self.download_path, exist_ok=True)
        
    def login_sii(self, rut, clave):
        """
        Realiza el login en el SII
        
        Args:
            rut (str): RUT del usuario
            clave (str): Clave del usuario
        """
        try:
            print("Accediendo al sitio del SII...")
            self.driver.get("https://www.sii.cl")
            
            # Buscar y hacer click en "Servicios Online"
            print("Buscando 'Servicios Online'...")
            servicios_online = self.wait.until(
                EC.element_to_be_clickable((By.LINK_TEXT, "Servicios Online"))
            )
            servicios_online.click()
            
            # Esperar a que cargue la página de login
            print("Ingresando credenciales...")
            time.sleep(2)
            
            # Ingresar RUT
            rut_field = self.wait.until(
                EC.presence_of_element_located((By.NAME, "RUT"))
            )
            rut_field.clear()
            rut_field.send_keys(rut)
            
            # Ingresar clave
            clave_field = self.driver.find_element(By.NAME, "password")
            clave_field.clear()
            clave_field.send_keys(clave)
            
            # Hacer click en ingresar
            login_button = self.driver.find_element(By.XPATH, "//input[@type='submit' and @value='Ingresar']")
            login_button.click()
            
            # Esperar a que cargue el menú principal
            print("Esperando carga del menú principal...")
            time.sleep(3)
            
            return True
            
        except Exception as e:
            print(f"Error en login: {str(e)}")
            return False
    
    def navigate_to_boletas_honorarios(self):
        """Navega al módulo de boletas de honorarios electrónicas"""
        try:
            print("Navegando a Boleta de Honorario Electrónico...")
            
            # Buscar enlace de boletas de honorarios
            # Nota: Los selectores pueden cambiar, ajusta según la estructura actual
            boleta_honorarios = self.wait.until(
                EC.element_to_be_clickable((By.PARTIAL_LINK_TEXT, "Boleta de Honorario Electrónica"))
            )
            boleta_honorarios.click()
            
            time.sleep(2)
            
            print("Accediendo a Emisor de boletas de honorarios...")
            emisor_boletas = self.wait.until(
                EC.element_to_be_clickable((By.PARTIAL_LINK_TEXT, "Emisor de boletas de honorarios"))
            )
            emisor_boletas.click()
            
            time.sleep(2)
            
            return True
            
        except Exception as e:
            print(f"Error navegando a boletas de honorarios: {str(e)}")
            return False
    
    def consultar_boletas_emitidas(self):
        """Accede a la consulta de boletas emitidas"""
        try:
            print("Accediendo a consultas sobre boleta de honorario electrónica...")
            
            consultar_boleta = self.wait.until(
                EC.element_to_be_clickable((By.PARTIAL_LINK_TEXT, "Consultar sobre boleta de honorario electrónica"))
            )
            consultar_boleta.click()
            
            time.sleep(2)
            
            print("Seleccionando 'Consultar boletas emitidas'...")
            consultar_emitidas = self.wait.until(
                EC.element_to_be_clickable((By.PARTIAL_LINK_TEXT, "Consultar boletas emitidas"))
            )
            consultar_emitidas.click()
            
            time.sleep(3)
            
            return True
            
        except Exception as e:
            print(f"Error en consulta de boletas emitidas: {str(e)}")
            return False
    
    def consultar_anual_y_descargar(self):
        """Consulta el reporte anual y lo descarga como PDF"""
        try:
            print("Buscando la opción de consulta anual...")
            
            # Buscar la primera columna de la tabla (consulta anual)
            # Ajusta el selector según la estructura actual de la tabla
            consultar_anual = self.wait.until(
                EC.element_to_be_clickable((By.XPATH, "//table//tr[1]//td[1]//a | //input[@value='Consultar']"))
            )
            consultar_anual.click()
            
            time.sleep(3)
            
            print("Buscando opción de imprimir...")
            
            # Buscar botón de imprimir/PDF
            # Estos selectores pueden variar - ajusta según el sitio actual
            imprimir_button = None
            
            # Intentar diferentes selectores para el botón de imprimir
            selectors_imprimir = [
                "//input[@value='Imprimir']",
                "//a[contains(text(), 'Imprimir')]",
                "//button[contains(text(), 'Imprimir')]",
                "//input[contains(@value, 'PDF')]",
                "//a[contains(text(), 'PDF')]"
            ]
            
            for selector in selectors_imprimir:
                try:
                    imprimir_button = self.driver.find_element(By.XPATH, selector)
                    break
                except NoSuchElementException:
                    continue
            
            if imprimir_button:
                print("Haciendo click en imprimir/PDF...")
                imprimir_button.click()
                
                # Esperar a que se genere y descargue el PDF
                print("Esperando descarga del PDF...")
                time.sleep(10)
                
                print("¡PDF descargado exitosamente!")
                return True
            else:
                print("No se encontró el botón de imprimir/PDF")
                return False
            
        except Exception as e:
            print(f"Error al descargar PDF: {str(e)}")
            return False
    
    def run_scraping(self, rut, clave):
        """Ejecuta todo el proceso de scraping"""
        try:
            print("Iniciando proceso de web scraping SII...")
            
            # Configurar driver
            self.setup_driver()
            
            # Realizar login
            if not self.login_sii(rut, clave):
                print("Error en el login")
                return False
            
            # Navegar a boletas de honorarios
            if not self.navigate_to_boletas_honorarios():
                print("Error navegando a boletas de honorarios")
                return False
            
            # Consultar boletas emitidas
            if not self.consultar_boletas_emitidas():
                print("Error en consulta de boletas emitidas")
                return False
            
            # Consultar anual y descargar
            if not self.consultar_anual_y_descargar():
                print("Error descargando reporte anual")
                return False
            
            print("¡Proceso completado exitosamente!")
            return True
            
        except Exception as e:
            print(f"Error general: {str(e)}")
            return False
        
        finally:
            if self.driver:
                print("Cerrando navegador...")
                self.driver.quit()

def main():
    """Función principal para ejecutar el scraper"""
    
    # Configuración - MODIFICA ESTOS VALORES
    RUT_USUARIO = "12345678-9"  # Tu RUT
    CLAVE_USUARIO = "tu_clave"   # Tu clave del SII
    RUTA_DESCARGA = "/ruta/generica/descargas/sii"  # Modifica esta ruta
    
    # Crear instancia del scraper
    scraper = SIIScraper(download_path=RUTA_DESCARGA)
    
    # Ejecutar scraping
    success = scraper.run_scraping(RUT_USUARIO, CLAVE_USUARIO)
    
    if success:
        print(f"Archivos descargados en: {RUTA_DESCARGA}")
    else:
        print("El proceso falló. Revisa los mensajes de error.")

if __name__ == "__main__":
    # Requisitos previos
    print("REQUISITOS PREVIOS:")
    print("1. Instalar: pip install selenium")
    print("2. Descargar ChromeDriver desde: https://chromedriver.chromium.org/")
    print("3. Agregar ChromeDriver al PATH del sistema")
    print("4. Modificar las credenciales y ruta en el código")
    print("-" * 50)
    
    main()