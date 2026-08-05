"""Parse UP Excise HTML-disguised .xls exports into normalized JSON.
Run only on an authorised machine/session. No CAPTCHA or access-control bypass."""
from pathlib import Path
from bs4 import BeautifulSoup
import argparse,json,re

def number(v):
    try:return float(v.replace(',','').strip())
    except:return None

def parse(path):
    soup=BeautifulSoup(Path(path).read_text(encoding='utf-8',errors='ignore'),'html.parser')
    tables=soup.find_all('table')
    table=max(tables,key=lambda t:len(t.find_all('tr')))
    rows=[]
    for tr in table.find_all('tr')[1:]:
        c=[x.get_text(' ',strip=True) for x in tr.find_all(['td','th'])]
        if len(c)<18: continue
        rows.append({'district':c[1],'circle':c[2],'month':c[3],'shop_id':c[4],'shop_name':c[5],'license_type':c[6],'mgr_assigned':number(c[7]),'final_required':number(c[10]),'mgr_lifted':number(c[15]),'balance':number(c[16]),'achievement':number(c[17])})
    return rows

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('xls');ap.add_argument('--circle');ap.add_argument('-o','--output',default='normalized.json');a=ap.parse_args()
    rows=parse(a.xls)
    if a.circle: rows=[r for r in rows if r['circle'].lower()==a.circle.lower()]
    Path(a.output).write_text(json.dumps({'rows':rows},indent=2),encoding='utf-8')
    print(f'wrote {len(rows)} rows to {a.output}')
