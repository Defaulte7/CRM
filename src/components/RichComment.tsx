import { type ReactNode } from 'react';

// Regex для обнаружения URL в тексте
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

interface RichCommentProps {
  text: string;
  images?: string[];
  className?: string;
}

/**
 * Компонент для отображения текста комментария с кликабельными ссылками
 * и прикреплёнными изображениями
 */
export function RichComment({ text, images = [], className = '' }: RichCommentProps) {
  if (!text && images.length === 0) {
    return <span className="text-gray-400 italic">Нет комментария</span>;
  }

  // Разбиваем текст на части: обычный текст и ссылки
  const parts = parseTextWithLinks(text);

  return (
    <div className={className}>
      {text && (
        <div className="whitespace-pre-wrap break-words">
          {parts.map((part, idx) => {
            if (part.isLink) {
              return (
                <a
                  key={idx}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  {part.display}
                </a>
              );
            }
            return <span key={idx}>{part.text}</span>;
          })}
        </div>
      )}
      
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <ImagePreview key={idx} src={img} index={idx} allImages={images} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ParsedPart {
  text: string;
  isLink: boolean;
  href?: string;
  display?: string;
}

function parseTextWithLinks(text: string): ParsedPart[] {
  if (!text) return [];
  
  const parts: ParsedPart[] = [];
  let lastIndex = 0;
  
  // Сброс regex
  URL_REGEX.lastIndex = 0;
  
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    // Текст до ссылки
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isLink: false });
    }
    
    // Ссылка
    const url = match[0];
    parts.push({
      text: url,
      isLink: true,
      href: url,
      display: url.length > 50 ? url.slice(0, 47) + '...' : url,
    });
    
    lastIndex = match.index + url.length;
  }
  
  // Оставшийся текст после последней ссылки
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isLink: false });
  }
  
  return parts;
}

// =================== IMAGE PREVIEW ===================
function ImagePreview({ src, index, allImages }: { src: string; index: number; allImages: string[] }) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Открываем полноразмерное изображение
    openImageGallery(allImages, index);
  };

  return (
    <div
      className="relative group cursor-pointer"
      onClick={handleClick}
    >
      <img
        src={src}
        alt={`Прикреплённое изображение ${index + 1}`}
        className="w-20 h-20 object-cover rounded-lg border-2 border-gray-200 hover:border-blue-400 transition-shadow hover:shadow-md"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
        <span className="text-white opacity-0 group-hover:opacity-100 text-lg">🔍</span>
      </div>
    </div>
  );
}

// Галерея изображений (простая модалка)
function openImageGallery(images: string[], startIndex: number) {
  // Создаём DOM-элемент для галереи
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4';
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };

  let currentIndex = startIndex;

  const renderImage = () => {
    const container = overlay.querySelector('.gallery-content');
    if (!container) return;
    container.innerHTML = '';

    const img = document.createElement('img');
    img.src = images[currentIndex];
    img.className = 'max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl';
    container.appendChild(img);

    // Счётчик
    const counter = document.createElement('div');
    counter.className = 'absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-full text-sm';
    counter.textContent = `${currentIndex + 1} / ${images.length}`;
    overlay.appendChild(counter);

    // Кнопки навигации
    if (images.length > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl backdrop-blur-sm';
      prevBtn.textContent = '‹';
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        renderImage();
      };
      overlay.appendChild(prevBtn);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl backdrop-blur-sm';
      nextBtn.textContent = '›';
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % images.length;
        renderImage();
      };
      overlay.appendChild(nextBtn);
    }

    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl backdrop-blur-sm';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(closeBtn);

    // Кнопка скачать
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'absolute top-4 right-16 bg-white/20 hover:bg-white/40 text-white w-10 h-10 rounded-full flex items-center justify-center text-lg backdrop-blur-sm';
    downloadBtn.textContent = '⬇';
    downloadBtn.title = 'Скачать изображение';
    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement('a');
      a.href = images[currentIndex];
      a.download = `image_${currentIndex + 1}.png`;
      a.click();
    };
    overlay.appendChild(downloadBtn);
  };

  // Контейнер для изображения
  const content = document.createElement('div');
  content.className = 'gallery-content relative flex items-center justify-center';
  overlay.appendChild(content);

  document.body.appendChild(overlay);
  renderImage();

  // Обработка клавиш
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', handleKey);
    } else if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + images.length) % images.length;
      renderImage();
    } else if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % images.length;
      renderImage();
    }
  };
  document.addEventListener('keydown', handleKey);
}

// =================== IMAGE INPUT ===================
interface ImageInputProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  maxSizeMB?: number;
}

export function ImageInput({ images, onChange, maxImages = 10, maxSizeMB = 5 }: ImageInputProps) {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (images.length >= maxImages) {
        alert(`Максимум ${maxImages} изображений`);
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        alert(`Файл "${file.name}" слишком большой. Максимум ${maxSizeMB} МБ`);
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert(`Файл "${file.name}" не является изображением`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Сжимаем изображение перед сохранением
        compressImage(result, 1200, 0.8).then(compressed => {
          onChange([...images, compressed]);
        });
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">Прикреплённые изображения</label>
        <label className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 cursor-pointer">
          📷 Добавить ({images.length}/{maxImages})
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>
      
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img}
                alt={`Изображение ${idx + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-300"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      
      <p className="text-xs text-gray-400 mt-1">
        Поддерживаются JPG, PNG, GIF. Макс. {maxSizeMB} МБ на файл. Изображения сохраняются в базе данных.
      </p>
    </div>
  );
}

// Сжатие изображения
function compressImage(dataUrl: string, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// =================== COMMENT INPUT WITH RICH FEATURES ===================
interface RichCommentInputProps {
  value: string;
  onChange: (value: string) => void;
  images: string[];
  onImagesChange: (images: string[]) => void;
  placeholder?: string;
  rows?: number;
}

export function RichCommentInput({ value, onChange, images, onImagesChange, placeholder, rows = 3 }: RichCommentInputProps) {
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
        placeholder={placeholder || 'Комментарий... (ссылки станут кликабельными автоматически)'}
      />
      <ImageInput images={images} onChange={onImagesChange} />
      
      {/* Превью ссылок */}
      {value && hasLinks(value) && (
        <div className="text-xs text-gray-500 bg-blue-50 rounded p-2">
          🔗 В тексте обнаружены ссылки — они будут кликабельными при просмотре
        </div>
      )}
    </div>
  );
}

function hasLinks(text: string): boolean {
  return URL_REGEX.test(text);
}
