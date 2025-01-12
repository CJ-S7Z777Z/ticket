
// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// Инициализация Express
const app = express();

// Инициализация Telegram бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Создание папки uploads, если она не существует
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Настройка Multer для обработки загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Генерация уникального имени файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
        cb(null, uniqueSuffix + '-' + sanitizedFilename);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // Максимальный размер файла: 20MB
});

// Middleware для обработки JSON и URL-encoded данных
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статика для доступа к загруженным файлам
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Маршрут для обработки формы
app.post('/submit', upload.array('files[]', 10), async (req, res) => {
    try {
        const data = req.body;
        const files = req.files;

        // Логирование полученных данных (для отладки)
        console.log('Полученные данные:', data);
        console.log('Полученные файлы:', files);

        // Проверка обязательных полей
        if (!data.Имя || !data.Телефон || !data['Вид продукции'] || !data.Ширина || !data.Высота || !data.Количество) {
            return res.status(400).send('Пожалуйста, заполните все обязательные поля.');
        }

        // Формирование сообщения
        let message = `📄 *Новая заявка*:\n\n`;
        message += `*Имя:* ${data.Имя || 'Не указано'}\n`;
        message += `*Телефон:* ${data.Телефон || 'Не указан'}\n`;
        if (data['E-mail']) {
            message += `*Почта:* ${data['E-mail']}\n`;
        }
        if (data.Комментарий) {
            message += `*Комментарий:* ${data.Комментарий}\n`;
        }
        if (data['Итоговая строка калькулятора с ценой']) {
            message += `*Итого:* ${data['Итоговая строка калькулятора с ценой']}\n`;
        }

        // Дополнительные поля
        message += `\n*Вид продукции:* ${data['Вид продукции'] || 'Не выбран'}\n`;
        message += `*Размер:* ${data['Ширина']} x ${data['Высота']} мм\n`;
        if (data.Материал) {
            message += `*Материал:* ${data.Материал}\n`;
        }
        message += `*Количество:* ${data.Количество}\n`;

        if (data['Установка люверсов'] === 'on') {
            message += `*Установка люверсов:* Да\n`;
            message += `*Количество люверсов:* ${data['Количество люверсов'] || 0}\n`;
        } else {
            message += `*Установка люверсов:* Нет\n`;
        }

        if (data['Для стендов'] === 'on') {
            message += `*Для стендов:* Да\n`;
            // Предполагается, что stands_details отправляется как JSON или строка. Нужно уточнить формат.
            if (data.stands_details) {
                try {
                    const standsDetails = JSON.parse(data.stands_details);
                    message += `*Детали стендов:*\n`;
                    for (const [key, value] of Object.entries(standsDetails)) {
                        message += ` - ${key}: ${value}\n`;
                    }
                } catch (err) {
                    // Если не JSON, просто вывести как есть
                    message += `*Детали стендов:* ${data.stands_details}\n`;
                }
            }
        } else {
            message += `*Для стендов:* Нет\n`;
        }

        if (data.Обрамление === 'on') {
            message += `*Обрамление профилем:* Да\n`;
            if (data['Цвет обрамления']) {
                message += `*Цвет обрамления:* ${data['Цвет обрамления']}\n`;
            }
        } else {
            message += `*Обрамление профилем:* Нет\n`;
        }

        // Добавление информации о файлах
        if (files && files.length > 0) {
            message += `\n📎 *Файлы:*\n`;
            files.forEach((file, index) => {
                const fileUrl = `${req.protocol}://${req.get('host')}/${file.path}`;
                message += `${index + 1}. [${file.originalname}](${fileUrl})\n`;
            });
        }

        // Отправка сообщения в Telegram
        await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });

        // Отправка файлов в Telegram как документы
        if (files && files.length > 0) {
            for (const file of files) {
                await bot.sendDocument(TELEGRAM_CHAT_ID, fs.createReadStream(file.path), {}, { filename: file.originalname });
                // Удаление файла после отправки (опционально, уберите следующую строку, если хотите сохранить файлы)
                fs.unlink(file.path, (err) => {
                    if (err) console.error(`Ошибка при удалении файла ${file.path}:`, err);
                });
            }
        }

        res.status(200).send('Заявка успешно отправлена!');
    } catch (error) {
        console.error('Ошибка при обработке заявки:', error);
        res.status(500).send('Произошла ошибка при обработке заявки.');
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
