use std::{env, fs, path::PathBuf};

use serde::Serialize;
use ultralytics_inference::YOLOModel;

#[derive(Serialize)]
struct Detection {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    score: f32,
    class_id: usize,
    class_name: String,
}

#[derive(Serialize)]
struct Output {
    detections: Vec<Detection>,
    annotated_path: Option<String>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let model = PathBuf::from(args.next().ok_or("missing model path")?);
    let image = PathBuf::from(args.next().ok_or("missing image path")?);
    let annotated = args.next().map(PathBuf::from);

    let mut yolo = YOLOModel::load(model)?;
    let results = yolo.predict(&image)?;
    let result = results.first().ok_or("YOLO returned no result")?;

    let mut detections = Vec::new();
    if let Some(boxes) = &result.boxes {
        let xyxy = boxes.xyxy();
        let conf = boxes.conf();
        let cls = boxes.cls();

        for i in 0..boxes.len() {
            let class_id = cls[i] as usize;
            let name = result
                .names
                .get(&class_id)
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            detections.push(Detection {
                x1: xyxy[[i, 0]],
                y1: xyxy[[i, 1]],
                x2: xyxy[[i, 2]],
                y2: xyxy[[i, 3]],
                score: conf[i],
                class_id,
                class_name: name,
            });
        }
    }

    let annotated_path = if let Some(path) = annotated {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        result.save(&path)?;
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    };

    println!("{}", serde_json::to_string(&Output { detections, annotated_path })?);
    Ok(())
}
