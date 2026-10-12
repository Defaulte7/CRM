const fs = require('fs');
const path = require('path');

// Путь к собранному проекту
const distPath = path.join(__dirname, 'dist');
const outputPath = path.join(__dirname, 'Мини-CRM.html');

// Читаем index.html
const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');

// Находим ссылки на JS и CSS
const jsMatch = indexHtml.match(/src="\/assets\/([^"]+)"/);
const cssMatch = indexHtml.match(/href="\/assets\/([^"]+)"/);

if (!jsMatch || !cssMatch) {
  console.error('Не найдены ссылки на ассеты в index.html');
  process.exit(1);
}

const jsFile = path.join(distPath, 'assets', jsMatch[1]);
const cssFile = path.join(distPath, 'assets', cssMatch[1]);

// Читаем содержимое ассетов
const jsContent = fs.readFileSync(jsFile, 'utf-8');
const cssContent = fs.readFileSync(cssFile, 'utf-8');

// Создаём standalone HTML
let standaloneHtml = indexHtml
  // Заменяем ссылку на CSS на inline
  .replace(
    /<link rel="stylesheet" crossorigin href="\/assets\/[^"]+">/,
    `<style>${cssContent}</style>`
  )
  // Заменяем ссылку на JS на inline
  .replace(
    /<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>/,
    `<script>${jsContent}</script>`
  );

// Сохраняем результат
fs.writeFileSync(outputPath, standaloneHtml, 'utf-8');

console.log('✅ Проект успешно упакован в один файл!');
console.log(`📄 Файл: ${outputPath}`);
console.log(`📊 Размер: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
console.log('');
console.log('🚀 Как использовать:');
console.log('   1. Откройте файл "Мини-CRM.html" в браузере Chrome или Edge');
console.log('   2. Нажмите "📄 Создать базу" для создания файла базы данных');
console.log('   3. Работайте! Данные автоматически сохраняются в CSV');
