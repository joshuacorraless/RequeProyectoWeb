import { pool } from "../db.js";
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import dotenv from 'dotenv';


// Configuración de dotenv (asegúrate de que esté al inicio del proceso)
dotenv.config();

// Variables de entorno
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


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


// *Función para obtener un evento por su ID
export const getEventById = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);

    // 1. Consulta el evento por su ID
    const [rows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [eventId]);

    // 2. Validar si existe
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    // 3. Retornar el primer registro (debería ser uno solo)
    return res.json(rows[0]);
  } catch (error) {
    console.error('Error obteniendo el evento por ID:', error);
    return res.status(500).json({ message: 'Error obteniendo el evento', error });
  }
};


// *Crear un nuevo evento
export const createEventos = async (req, res) => {
  const { nombre_evento, descripcion, fecha, hora, ubicacion, capacidad, categoria, precio, estado, imagenUrl } = req.body;
  
  try {
    // Validaciones básicas
    if (!nombre_evento || !fecha || !ubicacion) {
      return res.status(400).json({ message: 'Nombre, fecha y ubicación son obligatorios' });
    }

    // Insertar en la base de datos
    const [dbResult] = await pool.query(
      `INSERT INTO Evento 
       (nombre_evento, descripcion, fecha, hora, ubicacion, capacidad, categoria, precio, imagen, estado) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre_evento, descripcion, fecha, hora, ubicacion, capacidad, categoria, precio, imagenUrl, estado]
    );

    res.status(201).json({ 
      message: 'Evento creado exitosamente',
      id: dbResult.insertId,
      imagen: imagenUrl
    });

  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ 
      message: 'Error al crear evento',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
//Actualizar eventos
export const updateEventos = async (req, res) => {
  const { id_evento } = req.params;
  const { capacidad, ubicacion, precio, imagenUrl } = req.body;

  try {
    // Verificar que el evento exista
    const [eventRows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [id_evento]);
    if (eventRows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }

    const fieldsToUpdate = [];
    const values = [];

  
    // Validar y agregar otros campos
    if (capacidad) {
      if (isNaN(capacidad)) return res.status(400).json({ message: 'La capacidad debe ser un número.' });
      fieldsToUpdate.push('capacidad = ?');
      values.push(capacidad);
    }
    
    if (ubicacion) {
      fieldsToUpdate.push('ubicacion = ?');
      values.push(ubicacion);
    }
    
    if (precio) {
      if (isNaN(precio)) return res.status(400).json({ message: 'El precio debe ser un número.' });
      fieldsToUpdate.push('precio = ?');
      values.push(precio);
    }
    if(imagenUrl){
      fieldsToUpdate.push('imagen=?')
      values.push(imagenUrl)
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron datos para actualizar.' });
    }

    values.push(id_evento);
    const query = `UPDATE Evento SET ${fieldsToUpdate.join(', ')} WHERE id_evento = ?`;
    const [result] = await pool.query(query, values);

    if (result.affectedRows > 0) {
      return res.status(200).json({ message: 'Evento actualizado correctamente.' });
    } else {
      return res.status(404).json({ message: 'No se pudo actualizar el evento.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar el evento.' });
  }
};
//* Objeto en memoria para almacenar los códigos de verificación de eliminación
// *(en producción podrías guardarlos en una tabla de la DB)
const deletionCodes = {};

// *Configuración de nodemailer usando las variables de entorno
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS      
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
      await pool.query('SET FOREIGN_KEY_CHECKS = 0'); // Desactiva FK
      await pool.query('DELETE FROM Evento WHERE id_evento = ?', [eventId]);
      await pool.query('SET FOREIGN_KEY_CHECKS = 1'); // Reactiva FK
  
      // Limpia el código en memoria
      delete deletionCodes[eventId];
  
      res.json({ message: 'Evento eliminado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error confirmando eliminación', error });
    }
  };




  //* Aca la funcion para eliminar un evento en estado agotado

 

  let deletionFlow = {};
  //* ----------------------------------------------
// *1) Solicitar el número de teléfono y enviar una palabra por SMS
//* ----------------------------------------------

/**
 * POST /events/:id/request-delete (para eventos NO agotados)
 * (Esta función no se modifica, sigue usando nodemailer para enviar el código al correo)
 */

/**
 * Función para eliminar un evento en estado "Agotado" mediante proceso de verificación por SMS y correo.
 * 1) startDeleteAgotado: envía una palabra por SMS usando Twilio.
 */
export const startDeleteAgotado = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    // 1. Verificar si el evento existe y está "Agotado"
    const [rows] = await pool.query('SELECT * FROM Evento WHERE id_evento = ?', [eventId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    const event = rows[0];

    if (event.estado !== 'Agotado') {
      return res.status(400).json({ message: 'Este proceso aplica solo para eventos agotados' });
    }

    // 2. Generar una palabra aleatoria (6 caracteres)
    const randomWord = Math.random().toString(36).substring(2, 8);

    // 3. Guardar la información en el objeto "deletionFlow"
    deletionFlow[eventId] = {
      phoneWord: randomWord,
      phoneVerified: false,
      emailCode: null,
      emailVerified: false
    };

    // 4. Enviar SMS al administrador usando Twilio.
    // Puedes usar un número fijo o, si lo deseas, recibirlo en req.body.
    // En este ejemplo, usamos el número +50684311955.
    const phoneNumber = '+50662666896'; 

    const messageText = `La palabra para eliminar el evento "${event.nombre_evento}" es: ${randomWord}`;

    const twilioResponse = await twilioClient.messages.create({
      body: messageText,
      from: TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log('Twilio response:', twilioResponse);
    console.log(randomWord)
    // 5. Responder con éxito
    return res.json({ 
      message: 'Se envió la palabra por SMS. Ahora el administrador debe ingresar la palabra.'
    });
  } catch (error) {
    console.error('Error en startDeleteAgotado:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Error al iniciar la eliminación de evento agotado', error });
  }
};

/**
 * 2) verifySmsWord: Verifica la palabra enviada por SMS.
 */
export const verifySmsWord = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { word } = req.body; // La palabra ingresada por el administrador

    // Verificar que exista un flujo para este evento
    const flow = deletionFlow[eventId];
    if (!flow) {
      return res.status(400).json({ message: 'No se ha iniciado el proceso de eliminación para este evento' });
    }

    // Comparar la palabra
    if (flow.phoneWord !== word) {
      return res.status(400).json({ message: 'La palabra ingresada no coincide' });
    }

    // Marcar la verificación exitosa
    flow.phoneVerified = true;

    res.json({ message: 'Palabra verificada correctamente. Ahora se debe enviar el código al correo.' });
  } catch (error) {
    console.error('Error en verifySmsWord:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Error verificando la palabra', error });
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
    await pool.query('SET FOREIGN_KEY_CHECKS = 0'); // Reactiva FK
    await pool.query('DELETE FROM Evento WHERE id_evento = ?', [eventId]);
    await pool.query('SET FOREIGN_KEY_CHECKS = 1'); // Reactiva FK

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