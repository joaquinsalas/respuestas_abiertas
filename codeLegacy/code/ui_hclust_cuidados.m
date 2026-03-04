function ui_hclust_cuidados()
% UI para clustering jerárquico con selección interactiva de cortes
% - Click IZQUIERDO: previsualiza (línea AZUL) el corte del SUBÁRBOL clicado
%                    y muestra 2 oraciones más diferentes (ventana grande)
% - Click DERECHO: alterna decisión (línea ROJA) para "bajar un nivel" en ese subárbol
% - Finalizar y exportar: aplica TODAS las decisiones (por ramas) y genera CSVs

    % ---------- Cargar datos ----------
    embeddings = readtable('../data/20240509embeddings.csv', 'ReadVariableNames', true);
    T = readtable('../data/Filtered_Cuidados_manually.csv', 'TextType','string'); % <-- usa tu nombre exacto

    X = table2array(embeddings);
    if height(T) ~= size(X,1)
        error('Desfase filas: tabla (%d) vs embeddings (%d).', height(T), size(X,1));
    end

    % ---------- Estandarizar y linkage ----------
    Xz = zscore(X);
    Dv = pdist(Xz, 'euclidean');
    Z  = linkage(Dv, 'ward');
    Dsq = squareform(Dv);
    n = size(X,1);

    % ---------- Ventana de controles (uifigure) ----------
    uif = uifigure('Name','Clustering de Cuidados (Controles)', ...
                   'Color','w', 'Position',[80 80 560 140]);

    gl  = uigridlayout(uif, [2 3], ...
        'RowHeight', {'1x','fit'}, 'ColumnWidth', {'1x','fit','fit'}, ...
        'Padding', [10 10 10 10], 'RowSpacing',8,'ColumnSpacing',8);

    lbl = uilabel(gl, 'Text','Cortes decididos: (ninguno)', 'FontWeight','bold');
    lbl.Layout.Row = 1; lbl.Layout.Column = 1;

    btnClear = uibutton(gl, 'Text','Limpiar decisiones', 'ButtonPushedFcn', @onClear);
    btnClear.Layout.Row = 2; btnClear.Layout.Column = 2;

    btnFinish = uibutton(gl, 'Text','Finalizar y exportar', ...
        'ButtonPushedFcn', @onFinish, 'BackgroundColor',[0.15 0.6 0.2], 'FontColor','w');
    btnFinish.Layout.Row = 2; btnFinish.Layout.Column = 3;

    % ---------- Ventana del dendrograma (figure clásica) ----------
    fTree = figure('Name','Dendrograma (Ward)', 'Color','w', 'Position',[660 80 1000 700]);
    axTree = axes('Parent', fTree); %#ok<LAXES>
    [~,~,perm] = dendrogram(axTree, Z, 0); % dibuja árbol completo
    ylabel(axTree,'Distancia de enlace');  title(axTree,'Dendrograma (Ward)'); grid(axTree,'on');
    xlim(axTree, [0 n+1]); % hojas en 1..n según orden 'perm'

    % ---------- Estado compartido ----------
    S.T = T; S.Z = Z; S.D = Dsq; S.perm = perm; S.n = n;
    S.preview = struct('cutH',[],'I',[],'x1',[],'x2',[],'h',gobjects(1));
    S.decisions = struct('cutH',{},'I',{},'x1',{},'x2',{},'h',{});
    S.ax = axTree;
    guidata(uif, S); guidata(fTree, S);

    % ---------- Callbacks ----------
    fTree.WindowButtonDownFcn = @(src,evt) onMouseClick(src, uif, lbl);

    function onMouseClick(src, uifig, lblHandle)
        st = guidata(src); axc = st.ax;
        cp = axc.CurrentPoint; yClick = cp(1,2); xClick = cp(1,1);
        yl = axc.YLim; if yClick < yl(1) || yClick > yl(2), return; end

        % Mapea x a hoja más cercana (1..n => orden 'perm')
        xLeafPos = max(1, min(st.n, round(xClick)));
        leafID   = st.perm(xLeafPos);  % índice de observación real bajo el click

        clickType = get(src, 'SelectionType');   % 'normal' (izq), 'alt' (der)
        switch clickType
            case 'normal'   % PREVIEW + ventana grande
                doPreview(st, yClick, leafID, uifig);

            case 'alt'      % TOGGLE DECISIÓN
                doToggleDecision(st, yClick, leafID, uifig, lblHandle);

            otherwise
                % ignorar
        end
        % refresca los estados en ambas ventanas
        S2 = guidata(uif); guidata(uif, S2); guidata(src, S2);
    end

    % -------- Helpers: Preview (línea azul) y ventana grande --------
    function doPreview(st, cutH, leafID, uifig)
        [I, x1, x2] = branchInterval(st, cutH, leafID);
        if isempty(I)
            bigAlert(uifig, 'Corte no separa', 'Ese corte produce un solo clúster en esa rama.');
            return;
        end

        % Toggle preview si ya existe el mismo segmento
        if ~isempty(st.preview.cutH) && abs(st.preview.cutH - cutH) < 1e-6 ...
           && isequal(st.preview.I, I)
            if isgraphics(st.preview.h), delete(st.preview.h); end
            st.preview = struct('cutH',[],'I',[],'x1',[],'x2',[],'h',gobjects(1));
            guidata(uif, st); guidata(fTree, st);
            return;
        end

        % Redibuja preview
        if isgraphics(st.preview.h), delete(st.preview.h); end
        hold(st.ax,'on');
        h = plot(st.ax, [x1 x2], [cutH cutH], '-', 'LineWidth', 2.5, 'Color', [0 0.45 0.74]);
        hold(st.ax,'off');
        st.preview = struct('cutH',cutH,'I',I,'x1',x1,'x2',x2,'h',h);
        guidata(uif, st); guidata(fTree, st);

        % Muestra par más diferente (ventana grande)
        showMostDifferentPairLarge(uifig, st.T, st.D, I, cutH);
    end

    % -------- Helpers: Toggle decisión (línea roja por rama) --------
    function doToggleDecision(st, cutH, leafID, uifig, lblHandle)
        [I, x1, x2] = branchInterval(st, cutH, leafID);
        if isempty(I)
            bigAlert(uifig, 'Corte no separa', 'Ese corte produce un solo clúster en esa rama.');
            return;
        end

        % ¿Existe ya una decisión "parecida"? (misma rama y altura)
        idxMatch = [];
        for t = 1:numel(st.decisions)
            sameBranch = isequal(st.decisions(t).I, I);
            sameHeight = abs(st.decisions(t).cutH - cutH) < 1e-6;
            if sameBranch && sameHeight, idxMatch = t; break; end
        end

        if ~isempty(idxMatch)
            % Toggle OFF: borrar
            if isgraphics(st.decisions(idxMatch).h), delete(st.decisions(idxMatch).h); end
            st.decisions(idxMatch) = [];
        else
            % Agregar y dibujar
            hold(st.ax,'on');
            h = plot(st.ax, [x1 x2], [cutH cutH], 'r--', 'LineWidth', 2.0);
            hold(st.ax,'off');
            st.decisions(end+1) = struct('cutH',cutH,'I',I,'x1',x1,'x2',x2,'h',h);
        end

        % Actualiza etiqueta
        if isempty(st.decisions)
            lblHandle.Text = 'Cortes decididos: (ninguno)';
        else
            txt = arrayfun(@(d)sprintf('[H=%.3f; n=%d]', d.cutH, numel(d.I)), st.decisions, 'UniformOutput', false);
            lblHandle.Text = sprintf('Cortes decididos: %s', strjoin(txt, ', '));
        end

        guidata(uif, st); guidata(fTree, st);
    end

    % -------- Botón limpiar --------
    function onClear(~, ~)
        st = guidata(uif);
        % borrar decisiones (rojas)
        for t = 1:numel(st.decisions)
            if isgraphics(st.decisions(t).h), delete(st.decisions(t).h); end
        end
        st.decisions = struct('cutH',{},'I',{},'x1',{},'x2',{},'h',{});
        % borrar preview (azul)
        if isgraphics(st.preview.h), delete(st.preview.h); end
        st.preview = struct('cutH',[],'I',[],'x1',[],'x2',[],'h',gobjects(1));
        guidata(uif, st); guidata(fTree, st);
        lbl.Text = 'Cortes decididos: (ninguno)';
    end

    % -------- Finalizar: aplica decisiones por ramas y exporta --------
    function onFinish(~, ~)
        st = guidata(uif);

        if isempty(st.decisions)
            % si no hay decisiones, usa mayor salto global
            d  = st.Z(:,3); dd = diff(d);
            [~, j] = max(dd); cutH = (d(j)+d(j+1))/2;
            idx = cluster(st.Z, 'cutoff', cutH, 'criterion','distance');
        else
            % construye clusters respetando cortes por rama
            % Comenzamos con 1 cluster con todos los índices
            clusters = { (1:st.n).' };

            % Aplica decisiones ordenadas de "alto a bajo" (coarse->fine)
            [~, order] = sort([st.decisions.cutH], 'descend');
            for q = order
                I = st.decisions(q).I;  % subconjunto afectado
                cutH = st.decisions(q).cutH;

                % Encuentra el cluster actual que contiene este subconjunto
                host = [];
                for c = 1:numel(clusters)
                    if all(ismember(I, clusters{c})), host = c; break; end
                end
                if isempty(host), continue; end

                % Etiquetas globales al cutH
                idxCut = cluster(st.Z, 'cutoff', cutH, 'criterion','distance');

                % Particiona SOLO el host en tantos subgrupos como aparezcan en idxCut
                J = clusters{host};
                labs = idxCut(J);
                uLabs = unique(labs);
                newSubs = cell(numel(uLabs),1);
                for r = 1:numel(uLabs)
                    newSubs{r} = J(labs==uLabs(r));
                end
                % Reemplaza el host por los nuevos subclusters
                clusters(host) = [];
                clusters = [clusters; newSubs]; %#ok<AGROW>
            end

            % Construye vector de etiquetas final
            idx = zeros(st.n,1);
            for c = 1:numel(clusters)
                idx(clusters{c}) = c;
            end
        end

        K   = max(idx);
        % Exporta CSVs
        outBase = sprintf('hcluster_K%02d_custom', K);
        for k = 1:K
            Tk = st.T(idx==k, :);
            writetable(Tk, sprintf('%s_c%02d.csv', outBase, k));
        end
        Assign = table((1:height(st.T))', st.T.cuidados, idx, ...
            'VariableNames', {'row','cuidados','cluster'});
        writetable(Assign, sprintf('%s_assignments.csv', outBase));
        uialert(uif, sprintf(['Exportado:\n  %s_assignments.csv\n  %s_c**.csv'], ...
            outBase, outBase), 'Listo', 'Icon','success');
    end

    % ======== UTILIDADES ========

    % Devuelve el subconjunto I (índices de observaciones) del subárbol
    % que contiene 'leafID' al cortar a altura 'cutH', y su intervalo [x1,x2]
    % en el eje X del dendrograma (usado para pintar solo esa rama).
    function [I, x1, x2] = branchInterval(st, cutH, leafID)
        idx = cluster(st.Z, 'cutoff', cutH, 'criterion','distance');
        K   = max(idx);
        if K < 2
            I = []; x1 = []; x2 = []; return;
        end
        label = idx(leafID);
        I = find(idx == label);

        % Mapea cada observación de I a su posición X (1..n) vía 'perm'
        xPos = arrayfun(@(ii) find(st.perm==ii, 1, 'first'), I);
        x1 = min(xPos); x2 = max(xPos);
    end

    % Ventana grande: par más diferente DENTRO del subconjunto I (partición local)
function showMostDifferentPairLarge(parentUI, Ttab, Dmat, I, cutH)
    % Dmat: matriz de distancias completa (n x n)
    % I:    índices de las observaciones que sobreviven en la partición local
    %       (rama clicada al nivel cutH). Solo comparamos dentro de I.

    if numel(I) < 2
        bigAlert(parentUI, 'Corte no separa', ...
            'Ese corte deja < 2 elementos en esa rama; no hay par para comparar.');
        return;
    end

    % Distancias dentro de I (excluye diagonal)
    Di = Dmat(I, I);
    % Asegura que la diagonal no interfiera
    Di(1:size(Di,1)+1:end) = -inf;

    [bestDist, linIdx] = max(Di, [], 'all', 'linear');
    if ~isfinite(bestDist) || isempty(linIdx)
        bigAlert(parentUI, 'Sin pares', 'No se pudo determinar el par más diferente.');
        return;
    end
    [iLocal, jLocal] = ind2sub(size(Di), linIdx);
    bestPair = [I(iLocal), I(jLocal)];

    s1 = Ttab.cuidados(bestPair(1));
    s2 = Ttab.cuidados(bestPair(2));

    % Ventana modal grande
    dlg = uifigure('Name', sprintf('Corte %.3f: par más diferente (local)', cutH), ...
                   'Position', centerRect([900 520]), 'Color','w', 'WindowStyle','modal');
    gl2 = uigridlayout(dlg, [3 1], 'RowHeight', {'fit','1x','1x'}, 'Padding',10);
    uilabel(gl2, 'Text', sprintf('Distancia máx = %.4f (dentro de la rama)', bestDist), ...
            'FontWeight','bold');
    ta1 = uitextarea(gl2, 'Value', string(s1), 'Editable','off', 'WordWrap','on');
    ta2 = uitextarea(gl2, 'Value', string(s2), 'Editable','off', 'WordWrap','on');
    ta1.Layout.Row = 2; 
    ta2.Layout.Row = 3;
end


    % Alerta más grande (cuando no se separa)
    function bigAlert(parentUI, titleStr, msgStr)
        dlg = uifigure('Name', titleStr, 'Position', centerRect([560 220]), ...
                       'Color','w', 'WindowStyle','modal');
        glx = uigridlayout(dlg, [2 1], 'RowHeight', {'1x','fit'}, 'Padding',12);
        uitextarea(glx, 'Value', msgStr, 'Editable','off', 'WordWrap','on');
        uibutton(glx, 'Text','Cerrar', 'ButtonPushedFcn', @(~,~) close(dlg), ...
                 'BackgroundColor',[0.2 0.5 0.9], 'FontColor','w');
    end

    % Centra rectángulo [w h] en la pantalla
    function pos = centerRect(sz)
        if ismac || isunix
            scr = get(0,'MonitorPositions'); scr = scr(1,:);
        else
            scr = get(0,'ScreenSize');
        end
        w = sz(1); h = sz(2);
        x = scr(1) + (scr(3)-w)/2; y = scr(2) + (scr(4)-h)/2;
        pos = [x y w h];
    end
end


