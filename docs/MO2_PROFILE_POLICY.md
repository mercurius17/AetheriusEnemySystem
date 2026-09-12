# Política dos perfis MO2

## Invariante de plugins

Os perfis `AETHERIUS - GRAFICO - QUALIDADE` e `AETHERIUS - PERFORMANCE` podem
ter quantidades diferentes de mods habilitados. A quantidade de plugins ativos,
porém, deve permanecer igual nos dois perfis.

### Estado mais recente verificado pelo houseCARL

- `AETHERIUS - GRAFICO - QUALIDADE`: 375 plugins ativos.
- `AETHERIUS - PERFORMANCE`: 375 plugins ativos.
- Composição: 364 plugins marcados mais 11 masters/Creation
  Club implícitos.
- Mods habilitados atuais: 510 no perfil gráfico e 479 no perfil de
  performance.

O estado atual 375/375 satisfaz o invariante. O Enemy System não persiste essa
quantidade nem índices de carregamento; ela é verificada novamente a cada captura.

Qualquer alteração futura em um dos perfis deve preservar a igualdade da
quantidade de plugins ativos. A validação deve comparar os dois perfis com
`housecarl_load_order_status`; diferenças na quantidade de plugins ativos devem
ser tratadas como falha de compatibilidade até serem corrigidas.
