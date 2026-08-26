use std::{env, fs, io::{self, BufRead, Write}, path::PathBuf};

use serde::{Deserialize, Serialize};
use ultralytics_inference::YOLOModel;

#[derive(Serialize)]
struct Detection {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    score: f32,
    #[serde(rename = "classId")]
    class_id: usize,
    #[serde(rename = "className")]
    class_name: String,
}

#[derive(Serialize)]
struct Output {
    detections: Vec<Detection>,
    annotated_path: Option<String>,
}

#[derive(Deserialize)]
struct Request {
    image: PathBuf,
    annotated: Option<PathBuf>,
}

fn predict(yolo: &mut YOLOModel, request: Request) -> Result<Output, Box<dyn std::error::Error>> {
    let results = yolo.predict(&request.image)?;
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
                x2: xyxy[[i, 0]],
                y2: xyxy[[i, 1]],
                score: conf[i],
                class_id,
                class_name: name,
            });
        }
    }

    let annotated_path = if let Some(path) = request.annotated {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        result.save(&path)?;
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    };

    Ok(Output { detections, annotated_path })
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let model = PathBuf::from(args.next().ok_or("missing model path")?);

    // Load the model exactly once and keep the worker alive for all subsequent requests.
    let mut yolo = YOLOModel::load(model)?;
    println!("READY");
    io::stdout().flush()?;

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let request: Request = serde_json::from_str(&line)?;
        let output = predict(&mut yolo, request)?;
        serde_json::to_writer(&mut stdout, &output)?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }

    Ok(())
}
