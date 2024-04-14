const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const {join, relative} = require("path");
const serveIndex = require('serve-index');
const {createServer} = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

const options = {
    key: fs.readFileSync('./privatekey.pem'),
    cert: fs.readFileSync('./certificate.pem'),
};

// Директория, к которой нужно предоставить доступ
const instancePath = join(__dirname, 'instance');

// Настройка express.static для обслуживания файлов в директории instance
app.use(express.static(instancePath));

// Разрешаем доступ ко всем файлам и папкам
app.use('/instance', express.static(instancePath), serveIndex(instancePath, {'icons': true}))


const BASE_URL = "62.45.155.24:3000/instance/";

// Парсим JSON из запросов
app.use(bodyParser.json());

// Файл для хранения данных пользователей
const usersFile = 'users.json';

// Функция для загрузки данных о пользователях из файла
function loadUsers() {
    try {
        const data = fs.readFileSync(usersFile);
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading users:", error);
        return [];
    }
}

// Функция для сохранения данных о пользователях в файл
function saveUsers(users) {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error("Error saving users:", error);
    }
}


app.get('/api/info', (req, res) => {
    const info = [
        {
            "url": "62.45.155.24:3000/instance/Main/mods/Optifine.jar",
            "size": 6539012,
            "hash": "445a8cb8a1d565d8a1fabc0ba984c5936edbf561",
            "path": "mods/Optifine.jar"
        }
    ];
    res.json(info);
});

// Роут для аутентификации пользователя
app.post('/api/auth/authenticate', (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        res.status(401).json({ error: true, message: "Invalid credentials" });
        return;
    }

    res.json({
        access_token: user.access_token,
        uuid: user.uuid,
        username: user.username,
        banned: user.banned,
        money: user.money,
        role: user.role
    });
});

// Роут для верификации токена доступа
app.post('/api/auth/verify', (req, res) => {
    const { access_token } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.access_token === access_token);

    if (!user) {
        res.status(401).json({ error: true, message: "Invalid access token" });
        return;
    }

    res.json({
        access_token: user.access_token,
        uuid: user.uuid,
        username: user.username,
        banned: user.banned,
        money: user.money,
        role: user.role
    });
});

app.get('/api/getInstance', (req, res) => {
    const instance = req.query.instance; // Получаем значение параметра instance из запроса
    const instancePath = join(__dirname, 'instance', instance); // Собираем путь к указанной папке instance

    // Проверяем существование папки instance
    if (!fs.existsSync(instancePath)) {
        return res.status(404).json({ error: 'Instance not found' });
    }

    // Объявляем рекурсивную функцию для обработки файлов во всех вложенных папках
    function processFiles(dirPath) {
        const filesData = []; // Создаем массив для хранения данных о файлах

        // Считываем содержимое папки
        const files = fs.readdirSync(dirPath);

        // Для каждого файла в папке
        files.forEach(file => {
            const filePath = join(dirPath, file); // Собираем путь к файлу

            // Получаем информацию о файле
            const stats = fs.statSync(filePath);

            // Если файл - добавляем его в массив данных
            if (stats.isFile()) {
                const fileData = {
                    url: `${BASE_URL}${encodeURIComponent(instance)}/${encodeURIComponent(relative(instancePath, filePath)).replace("%5C", '/')}`, // Формируем URL файла
                    size: stats.size, // Размер файла
                    hash: calculateFileHash(filePath), // Хэш файла
                    path: relative(instancePath, filePath).replace(/\\/g, '/') // Относительный путь файла (без указания папки instance)
                };
                filesData.push(fileData);
            }

            // Если папка - вызываем функцию рекурсивно для обработки файлов внутри неё
            else if (stats.isDirectory()) {
                filesData.push(...processFiles(filePath));
            }
        });

        return filesData;
    }

    // Получаем данные о файлах
    const filesData = processFiles(instancePath);

    // Отправляем массив данных о файлах в формате JSON
    res.json(filesData);
});
// Функция для вычисления хэша файла
function calculateFileHash(filePath) {
    const hash = crypto.createHash('sha1');
    const fileData = fs.readFileSync(filePath);
    hash.update(fileData);
    return hash.digest('hex');
}

// Запуск сервера
const server = createServer(options, app).listen(PORT, function () {
    console.log("Express server listening on port " + PORT);
});
