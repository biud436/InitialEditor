// 새 게임 대화상자 (docs/plans/quality.md Q1). 템플릿을 그림으로 고르고, 이름과 폴더와 화면 크기와 스크립트 언어를 정한다.
// 폴더는 이 대화상자 안의 단추로 고른다 (웹판의 폴더 고르기는 클릭 안에서만 뜬다). 고른 것을 돌려주고 파일 쓰기는 newProject.ts 가 한다.

import type { ScriptBackend } from "@initial-editor/core";
import { useState, type FormEvent } from "react";
import { FilePlus2, FolderOpen } from "lucide-react";
import { Button, ChoiceCard, NumberInput, SegmentedControl, TextInput } from "@initial-editor/ui";
import type { Editor } from "../../editor/Editor";
import { NEW_GAME, TEMPLATE_COPY } from "../../editor/launcherText";
import type { NewGameChoice, NewGameFolder, NewProjectDialogDefaults } from "../../editor/newProject";
import type { ScreenSize } from "../../editor/scene/projectTemplates";
import { TEMPLATE_LANGUAGE, type ProjectTemplateId } from "../../editor/scene/templateManifest";
import flappyPreview from "./previews/flappy.png";
import rpgPreview from "./previews/rpg.png";
import tilemapPreview from "./previews/tilemap.png";
import "./NewGameDialog.css";

const TEMPLATES: ProjectTemplateId[] = ["empty", "flappy", "tilemap", "rpg"];
const PREVIEWS: Partial<Record<ProjectTemplateId, string>> = { flappy: flappyPreview, tilemap: tilemapPreview, rpg: rpgPreview };

type ScreenId = "landscape" | "portrait" | "pixel" | "custom";

const SCREENS: Record<Exclude<ScreenId, "custom">, ScreenSize & { label: string }> = {
  landscape: { label: "가로 960 x 540", width: 960, height: 540, scale: 1 }, // terms-ok: 가로 화면(landscape)의 뜻, 용어 개정 제안 (quality.md 7.3절)
  portrait: { label: "세로 480 x 800", width: 480, height: 800, scale: 1 }, // terms-ok: 세로 화면(portrait)의 뜻, 용어 개정 제안 (quality.md 7.3절)
  pixel: { label: "도트 320 x 180", width: 960, height: 540, scale: 3 },
};

/** 템플릿이 정한 화면 크기 (씬과 맵이 그 크기로 짜여 있다) */
const FIXED_SCREEN: Partial<Record<ProjectTemplateId, ScreenSize>> = {
  flappy: { width: 768, height: 896, scale: 1 },
  rpg: { width: 768, height: 896, scale: 1 },
};

const DEFAULT_SCREEN: Record<ProjectTemplateId, ScreenId> = { empty: "landscape", flappy: "landscape", tilemap: "pixel", rpg: "landscape" };

export function NewGameForm({ defaults, onSubmit, onCancel }: { defaults: NewProjectDialogDefaults; onSubmit: (choice: NewGameChoice) => void; onCancel: () => void }) {
  const [template, setTemplate] = useState<ProjectTemplateId>("empty");
  const [name, setName] = useState(defaults.name);
  const [folder, setFolder] = useState<NewGameFolder | null>(null);
  const [picking, setPicking] = useState(false);
  const [screen, setScreen] = useState<ScreenId>(DEFAULT_SCREEN.empty);
  const [custom, setCustom] = useState<ScreenSize>({ width: 640, height: 480, scale: 1 });
  const [chosenLanguage, setLanguage] = useState<ScriptBackend>("lua");
  const [touched, setTouched] = useState(false);

  const fixedLanguage = TEMPLATE_LANGUAGE[template];
  const language: ScriptBackend = fixedLanguage === "lua" ? "lua" : fixedLanguage === "ruby" ? "mruby" : chosenLanguage;
  const fixedScreen = FIXED_SCREEN[template];
  const size: ScreenSize = fixedScreen ?? (screen === "custom" ? custom : SCREENS[screen]);
  const nameError = name.trim() === "" ? NEW_GAME.nameRequired : null;
  const folderError = folder === null ? NEW_GAME.folderRequired : null;

  const chooseTemplate = (t: ProjectTemplateId) => {
    setTemplate(t);
    setScreen(DEFAULT_SCREEN[t]);
  };

  const pick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const chosen = await defaults.pickFolder();
      if (chosen) {
        setFolder(chosen);
        if (name.trim() === "") setName(chosen.label);
      }
    } finally {
      setPicking(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameError || folderError || !folder) return;
    onSubmit({ options: { template, language, name: name.trim(), screen: size }, folder });
  };

  return (
    <form className="new-game" onSubmit={submit} data-testid="new-project-dialog">
      <div className="new-game-body">
        <div className="new-game-templates" role="radiogroup" aria-label={NEW_GAME.template} data-testid="new-project-template">
          {TEMPLATES.map((t) => {
            const preview = PREVIEWS[t];
            return (
              <ChoiceCard
                key={t}
                selected={template === t}
                onSelect={() => chooseTemplate(t)}
                title={TEMPLATE_COPY[t].title}
                description={TEMPLATE_COPY[t].description}
                media={preview ? <img src={preview} alt="" /> : <FilePlus2 size={32} strokeWidth={1.25} aria-hidden />}
              />
            );
          })}
        </div>

        <div className="new-game-fields">
          <label className="new-game-label" htmlFor="new-game-name">
            {NEW_GAME.name}
          </label>
          <div className="new-game-control">
            <TextInput id="new-game-name" value={name} placeholder={NEW_GAME.namePlaceholder} sessionPrefix="new-game.name" invalid={touched && !!nameError} onChange={setName} ariaLabel={NEW_GAME.name} />
            {touched && nameError && <div className="new-game-error">{nameError}</div>}
          </div>

          <span className="new-game-label">{NEW_GAME.location}</span>
          <div className="new-game-control">
            <div className="new-game-folder">
              <span className={folder ? "new-game-folder-path" : "new-game-folder-empty"} title={folder?.detail ?? folder?.label} data-testid="new-project-folder">
                {folder ? (folder.detail ?? folder.label) : NEW_GAME.folderNone}
              </span>
              <Button icon={FolderOpen} onClick={() => void pick()} disabled={picking} data-testid="new-project-pick">
                {folder ? NEW_GAME.changeFolder : NEW_GAME.chooseFolder}
              </Button>
            </div>
            {touched && folderError && <div className="new-game-error">{folderError}</div>}
          </div>

          <span className="new-game-label">{NEW_GAME.screen}</span>
          <div className="new-game-control">
            {fixedScreen ? (
              <span className="new-game-fixed">{NEW_GAME.screenFixed(fixedScreen.width, fixedScreen.height)}</span>
            ) : (
              <>
                <SegmentedControl
                  ariaLabel={NEW_GAME.screen}
                  value={screen}
                  onChange={setScreen}
                  options={[
                    { value: "landscape", label: SCREENS.landscape.label },
                    { value: "portrait", label: SCREENS.portrait.label },
                    { value: "pixel", label: SCREENS.pixel.label },
                    { value: "custom", label: NEW_GAME.custom },
                  ]}
                />
                {screen === "pixel" && <div className="new-game-hint">{NEW_GAME.pixelHint}</div>}
                {screen === "custom" && (
                  <div className="new-game-custom">
                    <NumberInput value={custom.width} axis="W" unit="px" min={64} max={4096} integer sessionPrefix="new-game.w" ariaLabel={NEW_GAME.width} onChange={(v) => setCustom({ ...custom, width: v })} />
                    <NumberInput value={custom.height} axis="H" unit="px" min={64} max={4096} integer sessionPrefix="new-game.h" ariaLabel={NEW_GAME.height} onChange={(v) => setCustom({ ...custom, height: v })} />
                  </div>
                )}
              </>
            )}
          </div>

          <span className="new-game-label">{NEW_GAME.language}</span>
          <div className="new-game-control">
            <SegmentedControl
              ariaLabel={NEW_GAME.language}
              value={language}
              onChange={(v) => setLanguage(v)}
              options={fixedLanguage ? [{ value: "lua", label: "Lua" }] : [{ value: "lua", label: "Lua" }, { value: "mruby", label: "Ruby" }]}
            />
            {fixedLanguage && <div className="new-game-hint">{NEW_GAME.luaOnly}</div>}
            {language === "mruby" && defaults.rubyNote && (
              <div className="new-game-hint" data-testid="new-project-ruby-note">
                {defaults.rubyNote}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="new-game-actions">
        <Button onClick={onCancel}>{NEW_GAME.cancel}</Button>
        <Button type="submit" variant="primary" data-testid="new-project-ok">
          {NEW_GAME.create}
        </Button>
      </div>
    </form>
  );
}

/** 대화상자를 띄우고 고른 것을 돌려준다. 취소면 null */
export function openNewGameDialog(editor: Editor, defaults: NewProjectDialogDefaults): Promise<NewGameChoice | null> {
  return new Promise((resolve) => {
    let result: NewGameChoice | null = null;
    void editor.modals
      .custom({
        title: NEW_GAME.title,
        width: 760,
        render: (close) => (
          <NewGameForm
            defaults={defaults}
            onSubmit={(choice) => {
              result = choice;
              close();
            }}
            onCancel={close}
          />
        ),
      })
      .then(() => resolve(result));
  });
}
