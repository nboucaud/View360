import { AddDiv, AddDomElement, CreateDomElement } from '../engine/viewer/domutils.js';
import { AddCheckbox } from '../website/utils.js';
import { ShowMessageDialog } from './dialogs.js';
import { ButtonDialog } from './dialog.js';
import { HandleEvent } from './eventhandler.js';
import { Loc } from '../engine/core/localization.js';
import { Navigation } from '../engine/viewer/navigation.js';
import { GetDefaultCamera } from '../engine/viewer/viewer.js';
import { generatePdf } from './pdfGenerator.js';
import { TouchInteraction } from '../engine/viewer/navigation.js';
import * as THREE from 'three';

const CONFIG = {
    SNAPSHOT_SIZES: {
        LARGE: { width: 463, height: 500 },
        SMALL: { width: 231, height: 220 }
    },
    INITIAL_ZOOM: 0.2,
    MAX_ZOOM: 3,
    MIN_ZOOM: 0.1,
    ZOOM_SPEED: 0.001,
    ORBIT_RATIO: 0.1,
    PAN_RATIO: 0.075
};

export function ShowSharingDialog(settings, viewer) {
    console.log("ShowSharingDialog called with settings:", settings);
    const SnapshotManager = createSnapshotManager(viewer, settings);
    const DialogManager = createDialogManager(SnapshotManager);
    DialogManager.showDialog();
}

function createSnapshotManager(viewer, settings) {
    const cameras = Array(3).fill().map(() => ({ ...viewer.navigation.GetCamera() }));
    const states = Array(3).fill().map(() => ({
        isPanning: false,
        isOrbiting: false,
        startMousePosition: { x: 0, y: 0 },
        panOffset: { x: 0, y: 0 },
        orbitOffset: { x: 0, y: 0 },
        currentZoomLevel: CONFIG.INITIAL_ZOOM
    }));
    let previewImages = [];
    let touchInteractions = [];
    let renderers = [];

    function updateCanvas(index) {
        const { width, height } = index === 0 ? CONFIG.SNAPSHOT_SIZES.LARGE : CONFIG.SNAPSHOT_SIZES.SMALL;
        const camera = cameras[index];
        const renderer = renderers[index];
        const { panOffset, orbitOffset, currentZoomLevel } = states[index];

        viewer.navigation.MoveCamera(camera, 0);
        // Apply orbit
        viewer.navigation.Orbit(orbitOffset.x, orbitOffset.y);
        // Set aspect ratio and resize renderer
        viewer.renderer.setSize(width, height);
        viewer.camera.aspect = width / height;
        viewer.camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        
        // Explicitly set the size of the canvas element
        renderer.domElement.style.width = width + 'px';
        renderer.domElement.style.height = height + 'px';

        // Then set the renderer's internal size
        renderer.setSize(width, height, false); // 'false' ensures it doesn't change the canvas style
        renderer.render(viewer.scene, viewer.camera);
    }
    

    function captureSnapshot(index) {
        if (index < 0 || index >= cameras.length) {
            console.error(`Invalid index: ${index}`);
            return null;
        }

        const { width, height } = index === 0 ? CONFIG.SNAPSHOT_SIZES.LARGE : CONFIG.SNAPSHOT_SIZES.SMALL;
        const { currentZoomLevel, panOffset, orbitOffset } = states[index];
        const camera = cameras[index];

        camera.zoom = currentZoomLevel;
        camera.panOffset = panOffset;
        camera.orbitOffset = orbitOffset;
        camera.aspectRatio = width / height;

        return CaptureSnapshot(viewer, width, height, false, currentZoomLevel, panOffset, orbitOffset, camera);
    }

    function initializePreviewImages(containers) {
        previewImages = containers.map((container, index) => {
            const img = CreateDomElement('canvas', 'ov_snapshot_preview_image');
            container.appendChild(img);

            // Set initial size
            const { width, height } = index === 0 ? CONFIG.SNAPSHOT_SIZES.LARGE : CONFIG.SNAPSHOT_SIZES.SMALL;
            img.width = width;
            img.height = height;
            
            // Mouse events
            ['wheel', 'mousedown', 'mousemove', 'mouseup', 'contextmenu'].forEach(eventType => {
                img.addEventListener(eventType, (e) => handleMouseEvent(index, eventType, e), { passive: false });
            });
    
            // Touch events
            const touchInteraction = new TouchInteraction();
            touchInteractions[index] = touchInteraction;

            const renderer = new THREE.WebGLRenderer({ canvas: img, alpha: true });
            renderers.push(renderer);

            img.addEventListener('touchstart', (e) => handleTouchStart(index, e), { passive: false });
            img.addEventListener('touchmove', throttle((e) => handleTouchMove(index, e), 100), { passive: false });
            img.addEventListener('touchend', (e) => handleTouchEnd(index, e), { passive: false });
    
            return img;
        });
    
        // Update previews after initialization
        previewImages.forEach((_, index) => updateCanvas(index));
    }


    function handleTouchStart(index, event) {
        event.preventDefault();
        touchInteractions[index].Start(previewImages[index], event);
        const state = states[index];
        state.startMousePosition = touchInteractions[index].GetPosition();
        state.isOrbiting = true;
    }

    function throttle(callback, limit) {
        let waiting = false; // Initially, we're not waiting
        return function (...args) { // We return a throttled function
            if (!waiting) { // If we're not waiting
                callback.apply(this, args); // Execute users callback
                waiting = true; // Prevent future invocations
                setTimeout(function () { // After a period of time
                    waiting = false; // And allow future invocations
                }, limit);
            }
        };
    }

    function handleTouchMove(index, event) {
        event.preventDefault();
        touchInteractions[index].Move(previewImages[index], event);
    
        const state = states[index];
        const moveDiff = touchInteractions[index].GetMoveDiff();
        const distanceDiff = touchInteractions[index].GetDistanceDiff();
    
        if (touchInteractions[index].GetFingerCount() === 1) {
            // Continue using the Orbit functionality
            viewer.navigation.Orbit(moveDiff.x * CONFIG.ORBIT_RATIO, moveDiff.y * CONFIG.ORBIT_RATIO);
        } else if (touchInteractions[index].GetFingerCount() === 2) {
            // Use the EmbeddedViewer's navigation pan and zoom
            viewer.navigation.Pan(moveDiff.x * CONFIG.PAN_RATIO, moveDiff.y * CONFIG.PAN_RATIO);
            viewer.navigation.Zoom(distanceDiff * CONFIG.ZOOM_SPEED);
            
            // Adjust current zoom level in the state for consistency
            state.currentZoomLevel *= (1 - distanceDiff * 0.01);
            state.currentZoomLevel = Math.min(Math.max(state.currentZoomLevel, CONFIG.MIN_ZOOM), CONFIG.MAX_ZOOM);
        }
    
        updateCanvas(index);
    }
    
    function handleTouchEnd(index, event) {
        event.preventDefault();
        touchInteractions[index].End(previewImages[index], event);
        const state = states[index];
        state.isOrbiting = false;
    }

    function handleMouseEvent(index, eventType, event) {
        event.preventDefault();
        console.log(`Handling mouse event: ${eventType} for index: ${index}`);
        const state = states[index];
    
        const clientX = event.clientX || 0;
        const clientY = event.clientY || 0;
    
        switch (eventType) {
            case 'mousemove':
                if (!state.isPanning && !state.isOrbiting) return;
                const currentMousePosition = { x: clientX, y: clientY };
                const deltaX = currentMousePosition.x - state.startMousePosition.x;
                const deltaY = currentMousePosition.y - state.startMousePosition.y;
    
                if (state.isOrbiting) {
                    state.orbitOffset.x += deltaX * CONFIG.ORBIT_RATIO;
                    state.orbitOffset.y += deltaY * CONFIG.ORBIT_RATIO;
                } else if (state.isPanning) {
                    state.panOffset.x -= deltaX * CONFIG.PAN_RATIO;
                    state.panOffset.y -= deltaY * CONFIG.PAN_RATIO;
                }
                updateCanvas(index);
                state.startMousePosition = currentMousePosition;
                break;
            case 'mousedown':
                state.startMousePosition = { x: clientX, y: clientY };
                if (event.button === 0) {
                    state.isOrbiting = true;
                } else if (event.button === 1 || event.button === 2) {
                    state.isPanning = true;
                }
                break;
            case 'mouseup':
                state.isPanning = false;
                state.isOrbiting = false;
                break;
            case 'wheel':
                state.currentZoomLevel += event.deltaY * CONFIG.ZOOM_SPEED;
                state.currentZoomLevel = Math.min(Math.max(state.currentZoomLevel, CONFIG.MIN_ZOOM), CONFIG.MAX_ZOOM);
                updateCanvas(index);
                break;
        }
    }

    function cleanup() {
        previewImages.forEach((img, index) => {
            img.removeEventListener('wheel', (e) => handleMouseEvent(index, 'wheel', e));
            img.removeEventListener('mousedown', (e) => handleMouseEvent(index, 'mousedown', e));
        });
        document.removeEventListener('mousemove', handleMouseEvent);
        document.removeEventListener('mouseup', handleMouseEvent);
    }

    return { cleanup, captureSnapshot, initializePreviewImages, updateCanvas };
}

function CaptureSnapshot(viewer, width, height, isTransparent, zoomLevel, panOffset, orbitOffset, camera) {
    // Store original camera state
    const originalCamera = {
        eye: { x: camera.eye.x, y: camera.eye.y, z: camera.eye.z },
        center: { x: camera.center.x, y: camera.center.y, z: camera.center.z },
        up: { x: camera.up.x, y: camera.up.y, z: camera.up.z }
    };

    // Apply zoom
    const direction = {
        x: camera.eye.x - camera.center.x,
        y: camera.eye.y - camera.center.y,
        z: camera.eye.z - camera.center.z
    };

    const distance = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    const zoomedDistance = distance * zoomLevel;
    const zoomFactor = zoomedDistance / distance;

    const zoomedEye = {
        x: camera.center.x + direction.x * zoomFactor,
        y: camera.center.y + direction.y * zoomFactor,
        z: camera.center.z + direction.z * zoomFactor
    };

    // Apply pan
    const panScale = distance * 0.005; // Adjust this value as needed
    const right = {
        x: direction.y * camera.up.z - direction.z * camera.up.y,
        y: direction.z * camera.up.x - direction.x * camera.up.z,
        z: direction.x * camera.up.y - direction.y * camera.up.x
    };
    const rightLength = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    const normalizedRight = {
        x: right.x / rightLength,
        y: right.y / rightLength,
        z: right.z / rightLength
    };

    const pannedCenter = {
        x: camera.center.x + normalizedRight.x * panOffset.x * panScale + camera.up.x * panOffset.y * panScale,
        y: camera.center.y + normalizedRight.y * panOffset.x * panScale + camera.up.y * panOffset.y * panScale,
        z: camera.center.z + normalizedRight.z * panOffset.x * panScale + camera.up.z * panScale
    };
    const pannedEye = {
        x: zoomedEye.x + normalizedRight.x * panOffset.x * panScale + camera.up.x * panOffset.y * panScale,
        y: zoomedEye.y + normalizedRight.y * panOffset.x * panScale + camera.up.y * panScale,
        z: zoomedEye.z + normalizedRight.z * panOffset.x * panScale + camera.up.z * panScale
    };

    // Set temporary camera for snapshot
    camera.eye.x = pannedEye.x;
    camera.eye.y = pannedEye.y;
    camera.eye.z = pannedEye.z;
    camera.center.x = pannedCenter.x;
    camera.center.y = pannedCenter.y;
    camera.center.z = pannedCenter.z;
    viewer.navigation.MoveCamera(camera, 0);

    // Apply orbit
    viewer.navigation.Orbit(orbitOffset.x, orbitOffset.y);

    // Set aspect ratio and resize renderer
    viewer.renderer.setSize(width, height);
    viewer.camera.aspect = width / height;
    viewer.camera.updateProjectionMatrix();

    // Capture the image
    const imageDataUrl = viewer.GetImageAsDataUrl(width, height, isTransparent);

    // Restore original camera state
    camera.eye.x = originalCamera.eye.x;
    camera.eye.y = originalCamera.eye.y;
    camera.eye.z = originalCamera.eye.z;
    camera.center.x = originalCamera.center.x;
    camera.center.y = originalCamera.center.y;
    camera.center.z = originalCamera.center.z;
    camera.up.x = originalCamera.up.x;
    camera.up.y = originalCamera.up.y;
    camera.up.z = originalCamera.up.z;
    viewer.navigation.MoveCamera(camera, 0);

    return imageDataUrl;
}

function createDialogManager(snapshotManager) {

    function createPatientInfoSubHeader(container) {
        const subHeader = AddDomElement(container, 'h3', 'ov_form_sub_header');  
        subHeader.textContent = 'Enter patient details below: ';
        return subHeader;
    }

    function createMultiStepForm(parentDiv) {
        const formContainer = AddDiv(parentDiv, 'ov_dialog_form_container');
        const step1 = createStep(formContainer, 1);
        const step2 = createStep(formContainer, 2);
        return { step1, step2 };
    }

    function createStep(container, stepNumber) {
        const step = AddDiv(container, `ov_dialog_step ov_step${stepNumber}`);
        if (stepNumber === 2) step.style.display = 'none';

        const content = stepNumber === 1 ? createStep1Content(step) : createStep2Content(step);

        return step;
    }

    function createLabeledInput(container, type, labelText, placeholder, attributes = {}) {
        const wrapper = AddDiv(container, 'ov_input_wrapper');
        const label = AddDomElement(wrapper, 'label', 'ov_dialog_label');
        label.textContent = labelText;
        let input;
        if (type === 'textarea') {
            input = AddDomElement(wrapper, 'textarea', 'ov_dialog_input');
        } else {
            input = AddDomElement(wrapper, 'input', 'ov_dialog_input');
            input.type = type;
        }
        input.placeholder = placeholder;
        Object.entries(attributes).forEach(([key, value]) => input.setAttribute(key, value));
        return input;
    }

    function validateEmails() {
        const emails = [patientEmailInput.value.trim(), ...emailInputs.map(input => input.value.trim())];
        const uniqueEmails = new Set(emails.filter(email => email !== ''));

        if (uniqueEmails.size !== emails.filter(email => email !== '').length) {
            alert(Loc('Please ensure all email addresses are unique.'));
            return false;
        }

        let oneEmailFilled = false;
        for (const email of emails) {
            if (email !== '') {
                oneEmailFilled = true;
                break;
            }
        }

        if (!oneEmailFilled) {
            alert(Loc('Please enter at least one email address.'));
            return false;
        }

        return true;
    }

    function createStep1Content(step) {
        const container = AddDiv(step, 'ov_content_container');

        const headerSection = createHeaderSection(container);
        const contentWrapper = AddDiv(container, 'ov_content_wrapper');
        const formSection = createFormSection(contentWrapper);
        const previewSection = createPreviewSection(contentWrapper);

        return { ...headerSection, ...formSection, ...previewSection };
    }

    function createHeaderSection(container) {
        const header = AddDiv(container, 'ov_header_section');
        // AddDiv(header, 'ov_dialog_title', Loc('Share Snapshot'));
        AddDiv(header, 'ov_dialog_description', Loc('Quickly share a snapshot and details of where it hurts with family, friends, or therapists.'));
        return {};
    }

    function createPreviewSection(container) {
        const previewContainer = AddDiv(container, 'ov_preview_container');
        const preview1Container = AddDiv(previewContainer, 'ov_preview1_container');
        const previewRow = AddDiv(previewContainer, 'ov_preview_row');
        const preview2Container = AddDiv(previewRow, 'ov_preview2_container');
        const preview3Container = AddDiv(previewRow, 'ov_preview3_container');

        const previewContainers = [preview1Container, preview2Container, preview3Container];
        snapshotManager.initializePreviewImages(previewContainers);

        return { previewContainers };
    }

    function createFormSection(container) {
        const formContainer = AddDiv(container, 'ov_form_section');
        createPatientInfoSubHeader(formContainer);
        const infoFieldsContainer = AddDiv(formContainer, 'ov_info_fields_container');
        const nameInput = createLabeledInput(infoFieldsContainer, 'text', Loc('Name'), 'John Doe');
        const intensityInput = createLabeledInput(infoFieldsContainer, 'number', Loc('Pain Intensity'), 'Enter pain intensity (1-10)', { min: 1, max: 10 });
        const durationInput = createLabeledInput(infoFieldsContainer, 'text', Loc('Pain Duration'), 'Enter pain duration (e.g., 2 hours, 3 days)');
        const descriptionInput = createLabeledInput(infoFieldsContainer, 'textarea', Loc('Description'), 'Description (optional)');

        AddDiv(formContainer, 'ov_get_send_emails_intro', Loc('You can send this snapshot to up to 3 email addresses.'));
        const emailFieldsContainer = AddDiv(formContainer, 'ov_email_fields_container');
        const emailInputs = [];
        for (let i = 0; i < 3; i++) {
            const emailInput = createLabeledInput(emailFieldsContainer, 'email', `Email ${i + 1}`, `Enter email ${i + 1}`);
            emailInputs.push(emailInput);
        }

        AddDiv(formContainer, 'ov_get_patient_email_intro', Loc('Share your email with us so we can CC you in the report.'));
        const patientEmailInput = createLabeledInput(formContainer, 'email', 'Your Email', 'Enter your email', { required: true });

        const nextButton = AddDomElement(formContainer, 'button', 'ov_button ov_next_button');
        nextButton.textContent = Loc('Submit');
        nextButton.addEventListener('click', () => {
            step.style.display = 'none';
            step.nextElementSibling.style.display = 'block';
        });

        const downloadLink = AddDomElement(formContainer, 'div', 'ov_download_link');
        downloadLink.textContent = Loc('Download Report');
        downloadLink.addEventListener('click', () => {
            handleGeneratePdf(nameInput, intensityInput, durationInput, descriptionInput, emailFieldsContainer);
        });

        return { nameInput, intensityInput, durationInput, descriptionInput, emailInputs, patientEmailInput };
    }
    function createStep2Content(step) {
        AddDiv(step, 'ov_dialog_title', Loc('Additional Options'));

        AddCheckbox(step, 'send_to_self', Loc('Send to myself'), false, () => {});
        AddCheckbox(step, 'download_snapshot', Loc('Download snapshot and info'), false, () => {});

        const submitButton = AddDiv(step, 'ov_button ov_submit_button', Loc('Submit'));
        submitButton.addEventListener('click', () => handleSubmit());
    }

    function handleGeneratePdf(nameInput, intensityInput, durationInput, descriptionInput, emailFieldsContainer) {
        console.log('Generating PDF...');
        const snapshots = [1, 2, 3].map(i => snapshotManager.captureSnapshot(i - 1));
        const description = descriptionInput ? descriptionInput.value : '';

        const emails = [];
        for (let i = 0; i < emailFieldsContainer.children.length; i++) {
            const emailInput = emailFieldsContainer.children[i];
            if (emailInput.value) {
                emails.push(emailInput.value);
            }
        }

        const data = {
            name: nameInput.value || 'John Doe', // Use 'John Doe' if the field is empty
            email: emails.join(', ') || 'john_doe@gmail.com',
            description: description,
            intensity: intensityInput.value,
            duration: durationInput.value,
            images: snapshots,
            siteUrl: window.location.origin
        };

        generatePdf(data);
    }

    function handleSubmit() {
        console.log('Submitting...');
        // Implement submission logic
        ShowMessageDialog(Loc('Success'), Loc('Your snapshot and information have been shared.'));
    }

    function showDialog() {
        const overlay = createModalOverlay();
        document.body.appendChild(overlay);

        const dialog = new ButtonDialog();
        const contentDiv = dialog.Init(Loc('Share Snapshot'), [
            {
                name: Loc('Close'),
                onClick() {
                    dialog.Close();
                    removeOverlayIfExists(overlay);
                }
            }
        ]);

        const { step1, step2 } = createMultiStepForm(contentDiv);
        const originalClose = dialog.Close.bind(dialog);
        dialog.Close = function() {
            snapshotManager.cleanup();
            removeOverlayIfExists(overlay);
            originalClose();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                dialog.Close();
            }
        });

        dialog.Open();

        setTimeout(() => {
            styleDialogForSharing(dialog);
        }, 0);

        // Add resize event listener
        window.addEventListener('resize', () => {
            styleDialogForSharing(dialog);
        });
    }

    function createModalOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9998; // Ensure this is below the dialog but above everything else
        `;
        return overlay;
    }

    function styleDialogForSharing(dialog) {
        if (!dialog) {
            console.error('Invalid dialog object');
            return;
        }

        // Try to find the dialog element
        let dialogElement = null;
        if (dialog.GetContentDiv) {
            dialogElement = dialog.GetContentDiv().closest('.ov_dialog');
        }
        if (!dialogElement && dialog.dialogDiv) {
            dialogElement = dialog.dialogDiv;
        }
        if (!dialogElement) {
            console.error('Cannot find dialog element');
            return;
        }

        console.log('Styling dialog element:', dialogElement);

        dialogElement.style.zIndex = '9999';
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            dialogElement.style.width = '100%';
            dialogElement.style.height = '100%';
            dialogElement.style.maxWidth = '100%';
            dialogElement.style.maxHeight = '100%';
            dialogElement.style.top = '0';
            dialogElement.style.left = '0';
            dialogElement.style.transform = 'none';
            dialogElement.style.borderRadius = '0';
        } else {
            dialogElement.style.width = '90%';
            dialogElement.style.maxWidth = '1200px';
            dialogElement.style.maxHeight = '90vh';
            dialogElement.style.top = '50%';
            dialogElement.style.left = '50%';
            dialogElement.style.transform = 'translate(-50%, -50%)';
            dialogElement.style.borderRadius = '8px';
        }
        dialogElement.style.overflow = 'auto';
    }

    function removeOverlayIfExists(overlay) {
        if (overlay && overlay.parentNode === document.body) {
            document.body.removeChild(overlay);
        }
    }

    return { showDialog };
}