const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const app = express();

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads'))
    },
    filename: function (req, file, cb) {
        const date = req.body.date || new Date().toISOString().split('T')[0];
        cb(null, `attendance_${date}_${Date.now()}.dat`)
    }
});

const upload = multer({ storage: storage });

// Servir archivos estáticos
app.use(express.static('.'));

// Endpoint para listar archivos en la carpeta uploads
app.get('/uploads', (req, res) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            console.error('Error al leer la carpeta uploads:', err);
            res.status(500).json({ error: 'Error al leer la carpeta uploads' });
            return;
        }
        res.json(files);
    });
});

// Endpoint para subir archivos .dat
app.post('/uploads', upload.single('file'), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No se subió ningún archivo' });
        return;
    }
    res.json({ 
        message: 'Archivo subido correctamente',
        filename: req.file.filename
    });
});

// Endpoint para listar archivos de asistencia
app.get('/attendance', (req, res) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            console.error('Error al leer la carpeta uploads:', err);
            res.status(500).json({ error: 'Error al leer la carpeta uploads' });
            return;
        }

        const attendanceFiles = files
            .filter(file => file.startsWith('attendance_'))
            .map(file => {
                const date = file.split('_')[1];
                const content = fs.readFileSync(path.join(uploadsDir, file), 'utf8');
                const lines = content.split('\n')
                    .filter(line => line.trim())
                    .filter(line => {
                        const parts = line.split('\t');
                        return parts.length >= 2 && !isNaN(parseInt(parts[0]));
                    });
                return {
                    filename: file,
                    date: date,
                    count: lines.length
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(attendanceFiles);
    });
});

// Endpoint para servir archivos de la carpeta uploads
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.sendFile(filePath);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
}); 