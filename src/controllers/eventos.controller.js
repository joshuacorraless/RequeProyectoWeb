import { pool } from "../db.js";
import nodemailer from 'nodemailer';
import axios from 'axios';
import { format } from "mysql2";

//?Todo lo relacionado a los eventos:

//* Función para obtener todos los eventos



export const getEventos = async (req, res) => {
    try {
        // Realiza la consulta SQL para obtener todos los eventos
        const [rows] = await pool.query('SELECT * FROM Evento');
        
        // Envía los resultados como respuesta en formato JSON
        res.status(200).json(rows);
    } catch (error) {
        // En caso de error, imprime el error en la consola y responde con un mensaje de error
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los eventos.' });
    }
};

// *Crear un nuevo evento
export const createEventos = async (req, res) => {
    const { nombre_evento, descripcion, fecha, hora, ubicacion, capacidad, categoria, precio, estado } = req.body;
    const imagen = req.file ? req.file.filename : null;  //* Obtener el nombre de la imagen cargada
  
    //* Validación de los campos
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/; // *Formato de fecha (YYYY-MM-DD)
    const horaRegex = /^\d{2}:\d{2}$/; //* Formato de hora (HH:MM)
    if (!fecha.match(fechaRegex)) {
      return res.status(400).json({ message: 'La fecha no tiene un formato válido (YYYY-MM-DD).' });
    }
    if (!hora.match(horaRegex)) {
      return res.status(400).json({ message: 'La hora no tiene un formato válido (HH:MM).' });
    }
  
    try {
      const [result] = await pool.query(
        'INSERT INTO Evento (nombre_evento, descripcion, fecha, hora, ubicacion, capacidad, categoria, precio, imagen, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [nombre_evento, descripcion, fecha, hora, ubicacion, capacidad, categoria, precio, imagen, estado]
      );
      res.status(201).json({ message: 'Evento creado correctamente', evento: result });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al crear el evento.' });
    }
};



// * Actualizar un evento existente
export const updateEventos = async (req, res) => {
    const { id_evento } = req.params; // *ID del evento que se va a actualizar
    const { capacidad, ubicacion, precio } = req.body;
    const imagen = req.file ? req.file.filename : null;  // *Si se sube una nueva imagen

    // *Validación de los datos proporcionados
    if (capacidad && isNaN(capacidad)) {
        return res.status(400).json({ message: 'La capacidad debe ser un número.' });
    }
    if (precio && isNaN(precio)) {
        return res.status(400).json({ message: 'El precio debe ser un número.' });
    }

    //*Preparamos la consulta para actualizar los datos del evento
    try {
        const fieldsToUpdate = [];
        const values = [];

        // Añadir campos a la consulta solo si tienen un valor
        if (capacidad) {
            fieldsToUpdate.push('capacidad = ?');
            values.push(capacidad);
        }
        if (ubicacion) {
            fieldsToUpdate.push('ubicacion = ?');
            values.push(ubicacion);
        }
        if (precio) {
            fieldsToUpdate.push('precio = ?');
            values.push(precio);
        }
        if (imagen) {
            fieldsToUpdate.push('imagen = ?');
            values.push('uploads/eventos/' + imagen); // Ruta relativa de la imagen
        }

        // Si no hay campos para actualizar, devolver error
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ message: 'No se proporcionaron datos para actualizar.' });
        }

        // Añadir el ID del evento a los valores
        values.push(id_evento);

        // Ejecutamos la consulta de actualización
        const query = `UPDATE Evento SET ${fieldsToUpdate.join(', ')} WHERE id_evento = ?`;
        const [result] = await pool.query(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: 'Evento actualizado correctamente.' });
        } else {
            return res.status(404).json({ message: 'Evento no encontrado.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el evento.' });
    }
};



//* Objeto en memoria para almacenar los códigos de verificación de eliminación
// *(en producción podrías guardarlos en una tabla de la DB)
const deletionCodes = {};

// *Configuramos nodemailer para usar la cuenta de Gmail "logieventsreal@gmail.com"
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'logieventsreal@gmail.com',
    pass: 'foyl slnv ktmq qpsp'       
  }
});


/**
* *POST /events/:id/request-delete
* *Envía un código de verificación por correo para eliminar un evento
*/
export const requestDeleteEvent = async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const { email } = req.body; // Correo al que se enviará el código
  
      // Verifica que el evento exista
      const [rows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [eventId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Evento no encontrado' });
      }
  
      const event = rows[0];
  
      // Validar que el evento NO esté agotado (usamos la columna "estado")
      if (event.estado === 'Agotado') {
        return res.status(400).json({ message: 'No se puede eliminar un evento agotado' });
      }
  
      // Generar un código aleatorio de 6 dígitos
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      deletionCodes[eventId] = code;
  
      // Configurar y enviar el correo con el código
      const mailOptions = {
        from: 'logieventsreal@gmail.com',
        to: email,
        subject: 'Código de confirmación para eliminar evento',
        text: `El código de confirmación para eliminar el evento "${event.nombre_evento}" es: ${code}`
      };
  
      await transporter.sendMail(mailOptions);
      res.json({ message: 'Código de confirmación enviado a tu correo electrónico' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error solicitando eliminación', error });
    }
  };

/**
* *POST /events/:id/confirm-delete
** Valida el código y, si es correcto, elimina el evento
*/
export const confirmDeleteEvent = async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const { code } = req.body;
  
      // Verifica que el evento exista
      const [rows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [eventId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Evento no encontrado' });
      }
  
      // Compara el código almacenado
      if (!deletionCodes[eventId] || deletionCodes[eventId] !== code) {
        return res.status(400).json({ message: 'Código de confirmación inválido' });
      }
  
      // Elimina el evento
      await pool.query('DELETE FROM Evento WHERE id_evento = ?', [eventId]);
  
      // Limpia el código en memoria
      delete deletionCodes[eventId];
  
      res.json({ message: 'Evento eliminado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error confirmando eliminación', error });
    }
  };




  //* Aca la funcion para eliminar un evento en estado agotado

  //*  token -> 9Cktfuztw5XijiA9lOqjioTonDgDoE3B2C3t69qq

  let deletionFlow = {};
  //* ----------------------------------------------
// *1) Solicitar el número de teléfono y enviar una palabra por SMS
//* ----------------------------------------------
export const startDeleteAgotado = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);

    //* 1. Verificar si el evento está realmente "Agotado"
    const [rows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [eventId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    const event = rows[0];

    if (event.estado !== 'Agotado') {
      return res.status(400).json({ message: 'Este proceso aplica solo para eventos agotados' });
    }

    // *2. Generar una palabra aleatoria (puede ser un string simple)
    // *   Ejemplo: 6 letras. Usa la librería que prefieras; aquí haremos algo sencillo:
    const randomWord = Math.random().toString(36).substring(2, 8); // 6 caracteres alfanuméricos

    //*3. Guardamos en nuestro objeto "deletionFlow"
    deletionFlow[eventId] = {
      phoneWord: randomWord,
      phoneVerified: false,
      emailCode: null,
      emailVerified: false
    };

    // *4. Enviar SMS al administrador
    // *   Asumimos que siempre usas el número +506 8431-1955 según tu prueba con SMSAPI
    // *   O podrías recibirlo de req.body si quieres hacerlo dinámico
    const phoneNumber = '+50684311955';

    // *Llamada a la API de SMSAPI (ejemplo usando axios)
    // *Ajusta según la documentación de SMSAPI
    // *Documentación: https://smsapi.com/docs/
    // *Endpoint (ejemplo): https://api.smsapi.com/sms.do
    // *Usando el token de API en el header Authorization: Bearer ...
    const smsApiToken = '9Cktfuztw5XijiA9lOqjioTonDgDoE3B2C3t69qq'; 

    await axios.post(
      'https://api.smsapi.com/sms.do',
      null, // body
      {
        params: {
          to: phoneNumber,
          message: `La palabra para eliminar el evento "${event.nombre_evento}" es: ${randomWord}`,
          from: 'Test',
          format: 'json'
        },
        headers: {
          Authorization: `Bearer ${smsApiToken}`
        }
      }
    );

    //* 5. Responder éxito
    return res.json({ 
      message: 'Se envió la palabra por SMS. Ahora el administrador debe ingresar la palabra.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al iniciar la eliminación de evento agotado', error });
  }
};

//* ----------------------------------------------
//* 2) Verificar la palabra enviada por SMS
//* ----------------------------------------------
export const verifySmsWord = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { word } = req.body; //* la palabra que el admin ingresa

    //* Verificar que tengamos un flujo de eliminación para este evento
    const flow = deletionFlow[eventId];
    if (!flow) {
      return res.status(400).json({ message: 'No se ha iniciado el proceso de eliminación para este evento' });
    }

    //* Comparar la palabra
    if (flow.phoneWord !== word) {
      return res.status(400).json({ message: 'La palabra ingresada no coincide' });
    }

    //* Marcar phoneVerified = true
    flow.phoneVerified = true;

    res.json({
      message: 'Palabra verificada correctamente. Ahora se debe enviar el código al correo.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error verificando la palabra', error });
  }
};

//* ----------------------------------------------
//* 3)Solicitar el correo y enviar código de verificación
//* ----------------------------------------------
export const sendEmailCode = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { email } = req.body; //* correo del admin

    const flow = deletionFlow[eventId];
    if (!flow) {
      return res.status(400).json({ message: 'No se ha iniciado el proceso de eliminación para este evento' });
    }

    //* Verificar que ya se haya verificado el teléfono primero
    if (!flow.phoneVerified) {
      return res.status(400).json({ message: 'Primero debe verificar la palabra enviada por SMS' });
    }

    //* Generar un código de 6 dígitos
    const emailCode = Math.floor(100000 + Math.random() * 900000).toString();
    flow.emailCode = emailCode; // *guardarlo en el flujo
    flow.emailVerified = false; //* por si acaso

    //* Enviar el correo con nodemailer
    const [rows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [eventId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    const event = rows[0];

    const mailOptions = {
      from: 'logieventsreal@gmail.com',
      to: email,
      subject: 'Código de confirmación para eliminar evento agotado',
      text: `El código para eliminar el evento "${event.nombre_evento}" es: ${emailCode}`
    };

    await transporter.sendMail(mailOptions);

    res.json({
      message: 'Código de verificación enviado al correo. Ingrese el código para continuar.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error enviando código al correo', error });
  }
};

//* ----------------------------------------------
// *4) Verificar el código de correo
// *----------------------------------------------
export const verifyEmailCode = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { code } = req.body;

    const flow = deletionFlow[eventId];
    if (!flow) {
      return res.status(400).json({ message: 'No se ha iniciado el proceso de eliminación para este evento' });
    }

    //* Verificar que ya se haya verificado el teléfono
    if (!flow.phoneVerified) {
      return res.status(400).json({ message: 'Primero debe verificar la palabra enviada por SMS' });
    }

    //* Comparar el código
    if (flow.emailCode !== code) {
      return res.status(400).json({ message: 'El código de correo no coincide' });
    }

    //* Marcar emailVerified = true
    flow.emailVerified = true;

    res.json({
      message: 'Código de correo verificado. ¡Advertencia! La eliminación es irreversible. Confirme para eliminar.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error verificando el código de correo', error });
  }
};

//* ----------------------------------------------
//* 5) Confirmar eliminación definitiva del evento
// *----------------------------------------------
export const confirmDeleteAgotado = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const flow = deletionFlow[eventId];
    if (!flow) {
      return res.status(400).json({ message: 'No se ha iniciado el proceso de eliminación para este evento' });
    }

    //* Verificar que ambos pasos (SMS y correo) estén verificados
    if (!flow.phoneVerified || !flow.emailVerified) {
      return res.status(400).json({ message: 'Falta verificar la palabra SMS o el código de correo' });
    }

    //* Eliminar el evento de la base de datos
    await pool.query('DELETE FROM Evento WHERE id_evento = ?', [eventId]);

    //* Borrar el flujo de memoria
    delete deletionFlow[eventId];

    res.json({
      message: 'Evento eliminado definitivamente (proceso irreversible).'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error confirmando la eliminación', error });
  }
};