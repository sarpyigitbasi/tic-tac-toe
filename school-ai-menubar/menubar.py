import rumps
import subprocess
import threading
import os
from AppKit import NSApplication, NSApplicationActivationPolicyAccessory

OLLAMA_CMD = ['/opt/homebrew/bin/ollama', 'serve']
OLLAMA_ENV = {**os.environ, 'OLLAMA_ORIGINS': 'chrome-extension://*'}

ollama_process = None


def is_ollama_running():
    try:
        result = subprocess.run(
            ['/usr/bin/curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:11434/'],
            capture_output=True, text=True, timeout=2
        )
        return result.stdout.strip() == '200'
    except Exception:
        return False


class SchoolAIApp(rumps.App):
    def __init__(self):
        here = os.path.dirname(os.path.abspath(__file__))
        icon_path = os.path.join(here, 'icon.png')
        super().__init__('', icon=icon_path, template=True, quit_button=None)
        # Hide from Dock — menu bar only
        NSApplication.sharedApplication().setActivationPolicy_(NSApplicationActivationPolicyAccessory)

        self.status_item = rumps.MenuItem('Checking…')
        self.status_item.set_callback(None)

        self.toggle_item = rumps.MenuItem('Start Ollama', callback=self.toggle_ollama)

        self.menu = [
            self.status_item,
            None,
            self.toggle_item,
            None,
            rumps.MenuItem('Quit', callback=self.quit_app),
        ]

        self.refresh_status()
        # Auto-start Ollama if it isn't already running
        if not is_ollama_running():
            self.start_ollama()
        self.timer = rumps.Timer(self.poll_status, 5)
        self.timer.start()

    def refresh_status(self):
        running = is_ollama_running()
        if running:
            self.status_item.title = '🟢  Ollama: Running'
            self.toggle_item.title = 'Stop Ollama'
        else:
            self.status_item.title = '🔴  Ollama: Stopped'
            self.toggle_item.title = 'Start Ollama'

    def poll_status(self, _):
        self.refresh_status()

    def toggle_ollama(self, _):
        global ollama_process
        if is_ollama_running():
            self.stop_ollama()
        else:
            self.start_ollama()

    def start_ollama(self):
        global ollama_process

        def run():
            global ollama_process
            ollama_process = subprocess.Popen(
                OLLAMA_CMD,
                env=OLLAMA_ENV,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            ollama_process.wait()

        threading.Thread(target=run, daemon=True).start()
        rumps.notification('School AI', 'Ollama starting…', 'Ready in a few seconds.')
        # Refresh after a short delay
        threading.Timer(3, self.refresh_status).start()

    def stop_ollama(self):
        global ollama_process
        # Kill any running ollama serve process
        subprocess.run(['/usr/bin/pkill', '-f', 'ollama serve'], capture_output=True)
        if ollama_process:
            try:
                ollama_process.terminate()
            except Exception:
                pass
            ollama_process = None
        self.refresh_status()
        rumps.notification('School AI', 'Ollama stopped.', '')

    def quit_app(self, _):
        self.stop_ollama()
        rumps.quit_application()


if __name__ == '__main__':
    SchoolAIApp().run()
