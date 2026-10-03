from PIL import Image, ImageDraw
from pathlib import Path
def sheet(frames, file, columns, thumb):
    width,height=thumb
    rows=(len(frames)+columns-1)//columns
    canvas=Image.new('RGB',(width*columns,(height+28)*rows),'#111317')
    draw=ImageDraw.Draw(canvas)
    for i,frame in enumerate(frames):
        x=(i%columns)*width;y=(i//columns)*(height+28)
        img=Image.open(f'evidence/F{frame:03d}.png').convert('RGB').resize(thumb,Image.Resampling.LANCZOS)
        canvas.paste(img,(x,y));draw.text((x+12,y+height+8),f'F{frame:03d}',fill='white')
    canvas.save(file)
sheet([24,64,220,353,445,843],'keyframe-contact-sheet.png',3,(640,360))
for start in [88,200,316,412,512,640,760]:
    sheet([start-1,start,start+3,start+7,start+8],f'evidence/handoff-{start}.png',5,(384,216))
print('Six keyframes and seven five-frame handoff sheets written.')
