document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formEditarEvento');
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    const cancelBtn = document.getElementById('cancelBtn');
    const idEvento = sessionStorage.getItem('idEventoEditar');

    // Configurar eventos
    uploadArea.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleImageSelection);
    cancelBtn.addEventListener('click', confirmCancel);

    // Cargar datos del evento si existe ID
    if (idEvento) {
        cargarDatosEvento(idEvento);
    }
    async function subirImagenACloudinary(imagenFile) {
        const formData = new FormData();
        formData.append('file', imagenFile);
        formData.append('upload_preset', 'imagenesEvento'); 
    
        try {
            const response = await fetch('https://api.cloudinary.com/v1_1/dv9r6shcn/image/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            return data.secure_url; // Devuelve la URL pública de la imagen
        } catch (error) {
            console.error('Error al subir la imagen:', error);
            throw error;
        }
    }
    
    async function cargarDatosEvento(id) {
        try {
            const eventos = await obtenerEventos(); // Cargar eventos desde la API correctamente
            const evento = eventos.find(e => e.id_evento == id);
    
            if (evento) {
                console.log("Evento encontrado:", evento);
            } else {
                console.log("Evento no encontrado.");
            }
            
            // Llenar formulario
            document.getElementById('precio').value = evento.precio || '';
            document.getElementById('ubicacion').value = evento.ubicacion || '';
            document.getElementById('capacidad').value = evento.capacidad || '';
            
            // Mostrar imagen si existe
            if (evento.imagen) {
                showImagePreview(evento.imagen);
            }
        } catch (error) {
            console.error('Error:', error);
            Swal.fire('Error', 'No se pudo cargar el evento', 'error');
        }
    }

    function handleImageSelection(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validar imagen
        if (!file.type.match('image.*')) {
            Swal.fire('Error', 'Solo se permiten imágenes', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'La imagen no debe exceder 5MB', 'error');
            return;
        }

        // Mostrar vista previa
        const reader = new FileReader();
        reader.onload = (event) => {
            showImagePreview(event.target.result);
        };
        reader.readAsDataURL(file);
    }

    function showImagePreview(imageSrc) {
        uploadArea.innerHTML = `
            <img src="${imageSrc}" class="img-thumbnail mb-2" style="max-height: 200px;">
            <button type="button" class="btn btn-outline-secondary btn-sm">Cambiar imagen</button>
            <p class="small text-muted mt-1">Tamaño máximo: 5MB</p>
        `;
        
        // Reasignar evento al nuevo botón
        uploadArea.querySelector('button').addEventListener('click', () => {
            imageInput.click();
        });
    }


    // Obtener el botón con el id 'closeButton'
    const updateButton = document.getElementById('submitBtn');
    // Agregar el evento click al botón
    updateButton.addEventListener('click', function() {
        updateEvento();
    });

    async function updateEvento() {

    const imagenInput = document.getElementById('imageInput');
    let imagenUrl = ""; // Declarar la variable fuera del if

    if (imagenInput.files[0]) { 
        try {
            imagenUrl = await subirImagenACloudinary(imagenInput.files[0]);
        } catch (error) {
            console.error("Error al subir la imagen:", error);
            document.getElementById('imagenError').style.display = 'block';
            return;
        }
        
    } 

    console.log(imagenUrl);

    const eventoData = {
        ubicacion: document.getElementById('ubicacion').value,
        capacidad: document.getElementById('capacidad').value,
        precio: document.getElementById('precio').value,
        ...(imagenUrl && { imagenUrl: imagenUrl })
    };

    console.log(eventoData);
    

        fetch(`https://requeproyectoweb-production.up.railway.app/api/eventos/${idEvento}`, {
            method: "PUT",
            headers: {
                'Content-Type': 'application/json'  // Asegúrarse de especificar que es JSON
            },
            body: JSON.stringify(eventoData)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(errorData.message);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Evento Actualizado:", data);
            Swal.fire({
                icon: 'success',
                title: '¡Evento actualizado correctamente!',
                text: 'Los cambios se guardaron con éxito.',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#b99725',
            })
            .then(() => {
                // Redirigir a otra vista después de que el usuario haga clic en "Aceptar"
                window.location.href = "https://requeproyectoweb-production-3d39.up.railway.app/EventosAdmin";  
            });
        })
        .catch(error => {
            console.error("Error:", error);
            Swal.fire({
                icon: 'error',
                title: '¡Ups!',
                text: error.message,
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#b99725',
            });
        });
    }

    function validateForm() {
        let isValid = true;
        
        // Validar precio
        const precio = document.getElementById('precio');
        if (!precio.value || isNaN(precio.value)) {
            mostrarErrorCampo(precio, 'Precio inválido');
            isValid = false;
        }
        
        // Validar ubicación
        const ubicacion = document.getElementById('ubicacion');
        if (!ubicacion.value.trim()) {
            mostrarErrorCampo(ubicacion, 'Ubicación requerida');
            isValid = false;
        }
        
        // Validar capacidad
        const capacidad = document.getElementById('capacidad');
        if (!capacidad.value || isNaN(capacidad.value)) {
            mostrarErrorCampo(capacidad, 'Capacidad inválida');
            isValid = false;
        }
        
        return isValid;
    }

    function mostrarErrorCampo(input, mensaje) {
        input.classList.add('is-invalid');
        const feedback = input.nextElementSibling;
        if (feedback && feedback.classList.contains('invalid-feedback')) {
            feedback.textContent = mensaje;
        }
    }

    function confirmCancel() {
        Swal.fire({
            title: '¿Descartar cambios?',
            text: 'Los cambios no guardados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, descartar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = '/EventosAdmin';
            }
        });
    }

        // Función para obtener los eventos desde la API
        async function obtenerEventos() {
            try {
                const respuesta = await fetch("https://requeproyectoweb-production.up.railway.app/api/eventos");
                if (!respuesta.ok) {
                    throw new Error("Error al obtener los eventos");
                }
                return await respuesta.json();
            } catch (error) {
                console.error("Error al cargar los eventos:", error);
                return [];
            }
        }
});