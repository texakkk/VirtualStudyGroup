import tkinter as tk
from PIL import Image, ImageDraw, ImageTk

def draw_person():
    """Generates the person drawing and displays it in the UI."""
    width, height = 400, 400
    img = Image.new("RGB", (width, height), "skyblue")  # Skyblue background
    draw = ImageDraw.Draw(img)

    # Head
    draw.ellipse((150, 50, 250, 150), fill="peachpuff", outline="black", width=3)

    # Eyes
    draw.ellipse((170, 80, 190, 100), fill="white", outline="black")  # Left eye
    draw.ellipse((210, 80, 230, 100), fill="white", outline="black")  # Right eye
    draw.ellipse((180, 90, 185, 95), fill="black")  # Left pupil
    draw.ellipse((220, 90, 225, 95), fill="black")  # Right pupil

    # Smile
    draw.arc((170, 110, 230, 140), start=0, end=180, fill="black", width=3)

    # Body
    draw.rectangle((175, 150, 225, 250), fill="blue", outline="black", width=3)

    # Arms
    draw.line((175, 170, 120, 220), fill="black", width=6)  # Left arm
    draw.line((225, 170, 280, 220), fill="black", width=6)  # Right arm

    # Hands
    draw.ellipse((110, 210, 130, 230), fill="peachpuff", outline="black")  # Left hand
    draw.ellipse((270, 210, 290, 230), fill="peachpuff", outline="black")  # Right hand

    # Legs
    draw.line((190, 250, 170, 350), fill="black", width=6)  # Left leg
    draw.line((210, 250, 230, 350), fill="black", width=6)  # Right leg

    # Feet
    draw.ellipse((155, 340, 185, 370), fill="black")  # Left foot
    draw.ellipse((215, 340, 245, 370), fill="black")  # Right foot

    # Convert the image to a format Tkinter can use
    img_tk = ImageTk.PhotoImage(img)

    # Update the canvas image
    canvas.image = img_tk
    canvas.create_image(0, 0, anchor=tk.NW, image=img_tk)

# Create Tkinter UI
root = tk.Tk()
root.title("Draw a Person")

# Canvas to display the drawing
canvas = tk.Canvas(root, width=400, height=400, bg="white")
canvas.pack()

# Button to generate the person
btn_generate = tk.Button(root, text="Generate Person", command=draw_person, font=("Arial", 14), bg="lightblue")
btn_generate.pack(pady=10)

# Run the Tkinter event loop
root.mainloop()
