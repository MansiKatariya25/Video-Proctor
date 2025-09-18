from ultralytics import YOLO

YOLO("yolov8s.pt").export(
    format="onnx",
    imgsz=640,
    nms=True,
    dynamic=False,
    simplify=True
)
