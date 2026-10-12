import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

try {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error('Элемент #root не найден в DOM');
  }
  ReactDOM.createRoot(root).render(<App />);
} catch (error: any) {
  document.body.innerHTML = `
    <div style="padding: 40px; font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px;">
        <h2 style="color: #dc2626; margin: 0 0 10px 0;">❌ Ошибка запуска Мини-CRM</h2>
        <p style="color: #7f1d1d; margin: 0 0 10px 0;">${error?.message || 'Неизвестная ошибка'}</p>
        <p style="color: #7f1d1d; margin: 0; font-size: 14px;">
          Попробуйте:<br>
          • Перезагрузить страницу (F5)<br>
          • Очистить localStorage: <code>localStorage.clear()</code> в консоли<br>
          • Открыть файл в другом браузере (Chrome/Edge рекомендуется)
        </p>
      </div>
    </div>
  `;
}
