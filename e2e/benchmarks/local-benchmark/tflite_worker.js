/**
 * @license
 * Copyright 2023 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

// Load tfjs-tflite from jsdelivr because it correctly sets the
// "cross-origin-resource-policy" header.
// importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@latest/dist/tf-tflite.js');
importScripts('https://cdn.jsdelivr.net/npm/@webmachinelearning/webnn-polyfill/dist/webnn-polyfill.js');
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core");
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu");
importScripts("./tfjs-tflite/tf-tflite.js");
importScripts("../benchmark_util.js");

let tfliteModel;
let inputs;

// Receive message from the main thread
onmessage = async (message) => {
  if (message) {
    switch (message.data.actionType) {
      case 'load':
        if (tfliteModel) {
          tfliteModel.modelRunner.cleanUp();
        }
        tflite.setWasmPath('./tfjs-tflite/');
        let options = message.data.options;
        if (options.webnnDeviceType !== undefined) {
          options.delegatePath = './webnn_external_delegate_wasm.wasm';
        }
        // Load tflite model.
        try {
          tfliteModel = await tflite.loadTFLiteModel(message.data.url, options);
          inputs = tfliteModel.inputs;
          postMessage('OK');                
        } catch(e) {
          postMessage({error: e.message});
        }
        break;
      case 'getInputs':
        postMessage(inputs);
        break;
      case 'getProfilingResults':
        postMessage(tfliteModel.getProfilingResults());
        break;
      case 'predict':
        const inputTensorArray = [];
        let outputTensor;
        try {
          let inputData = message.data.inputData;
          if (!inputData[0].length) {
            // Single input, move it into an arrary
            inputData = [inputData];
          }
          for (let i = 0; i< inputs.length; i++) {
            const inputTensor = tf.tensor(
                inputData[i], inputs[i].shape, inputs[i].dtype);
            inputTensorArray.push(inputTensor);
          }
          outputTensor = tfliteModel.predict(inputTensorArray);
          let outputData = outputTensor.dataSync();
          if (outputTensor instanceof Array) {
            // Multiple outputs
            // Do copy to fix unexpected buffer offset from predict result,
            // which would cause transferring error.
            const bufferArray = outputData.map(output => { return output.slice(0).buffer; });
            postMessage({ outputData }, bufferArray);
          } else {
            // Single output
            // Do copy to fix unexpected buffer offset from predict result,
            // which would cause transferring error.
            outputData = outputData.slice(0);
            postMessage({ outputData }, [outputData.buffer]);
          }
        } catch(e) {
          postMessage({error: e.message});
        } finally {
          // dispose input and output tensors
          tf.dispose(inputTensorArray);
          tf.dispose(outputTensor);
        }
        break;
      default:
        break;
    }
  }
};
