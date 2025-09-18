How to export a known-good YOLOv8s ONNX with NMS (recommended)

1) Create and activate a Python env with CUDA if you have a GPU (CPU also works):

   python -m venv .venv
   .venv\Scripts\activate   # Windows PowerShell
   # or: source .venv/bin/activate

2) Install Ultralytics:

   pip install ultralytics onnx onnxruntime

3) Export YOLOv8s to ONNX with built-in NMS and static 640 input:

   python -c "from ultralytics import YOLO; YOLO('yolov8s.pt').export(format='onnx', imgsz=640, nms=True, dynamic=False, simplify=True)"

   This produces 'yolov8s.onnx' which already includes NMS in the graph.

4) Rename and move the model into the app's public models folder:

   rename yolov8s.onnx to yolov8s-nms.onnx
   move yolov8s-nms.onnx to public/models/

5) Ensure env is set (in project root .env):

   VITE_YOLO_MODEL_URL=/models/yolov8s-nms.onnx
   VITE_YOLO_OUTPUT_LAYOUT=nms
   VITE_YOLO_INPUT=640
   VITE_YOLO_SCORE=0.35
   VITE_YOLO_EP=webgpu,wasm

6) Restart the dev server so Vite picks up env vars:

   npm run dev

That’s it. The in-browser detector will use WebGPU (if available) and fall back to WASM.

