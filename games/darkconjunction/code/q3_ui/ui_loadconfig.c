// Copyright (C) 1999-2000 Id Software, Inc.
//
/*
=============================================================================

LOAD CONFIG MENU

=============================================================================
*/

#include "ui_local.h"


#define BACKGROUND			"menu/art/dark_scene"

#define ART_ARROWS			"menu/art/arrows_horz_0"
#define ART_ARROWLEFT		"menu/art/arrows_horz_left"
#define ART_ARROWRIGHT		"menu/art/arrows_horz_right"

#define MAX_CONFIGS			128
#define NAMEBUFSIZE			( MAX_CONFIGS * 16 )

#define ID_BACK				10
#define ID_GO				11
#define ID_LIST				12
#define ID_LEFT				13
#define ID_RIGHT			14

#define ARROWS_WIDTH		128
#define ARROWS_HEIGHT		48


typedef struct {
	menuframework_s	menu;

	menutext_s		banner;
	menubitmap_s	background;
//	menubitmap_s	framer;
	menutext_s		back;
	menulist_s		list;

	menubitmap_s	arrows;
	menubitmap_s	left;
	menubitmap_s	right;

	menubitmap_s	go;

	char			names[NAMEBUFSIZE];
	char*			configlist[MAX_CONFIGS];
} configs_t;

static configs_t	s_configs;


/*
===============
LoadConfig_MenuEvent
===============
*/
static void LoadConfig_MenuEvent( void *ptr, int event ) {
	if( event != QM_ACTIVATED ) {
		return;
	}

	switch ( ((menucommon_s*)ptr)->id ) {
	case ID_GO:
		trap_Cmd_ExecuteText( EXEC_APPEND, va( "exec %s\n", s_configs.list.itemnames[s_configs.list.curvalue] ) );
		UI_PopMenu();
		break;

	case ID_BACK:
		UI_PopMenu();
		break;

	case ID_LEFT:
		ScrollList_Key( &s_configs.list, K_LEFTARROW );
		break;

	case ID_RIGHT:
		ScrollList_Key( &s_configs.list, K_RIGHTARROW );
		break;
	}
}


/*
===============
LoadConfig_MenuInit
===============
*/
static void LoadConfig_MenuInit( void ) {
	int		i;
	int		len;
	char	*configname;

	UI_LoadConfig_Cache();

	memset( &s_configs, 0 ,sizeof(configs_t) );
	s_configs.menu.wrapAround = qtrue;
	s_configs.menu.fullscreen = qtrue;

	s_configs.banner.generic.type	= MTYPE_BTEXT;
	s_configs.banner.generic.x		= 320;
	s_configs.banner.generic.y		= 16;
	s_configs.banner.string			= "LOAD CONFIG";
	s_configs.banner.color			= color_white;
	s_configs.banner.style			= UI_CENTER;

	s_configs.background.generic.type	= MTYPE_BITMAP;
	s_configs.background.generic.name	= BACKGROUND;
	s_configs.background.generic.flags	= QMF_INACTIVE;
	s_configs.background.generic.x		= 0;  
	s_configs.background.generic.y		= 0;
	s_configs.background.width			= 640;
	s_configs.background.height			= 480;

	s_configs.arrows.generic.type	= MTYPE_BITMAP;
	s_configs.arrows.generic.name	= ART_ARROWS;
	s_configs.arrows.generic.flags	= QMF_INACTIVE;
	s_configs.arrows.generic.x		= 320-ARROWS_WIDTH/2;
	s_configs.arrows.generic.y		= 400;
	s_configs.arrows.width			= ARROWS_WIDTH;
	s_configs.arrows.height			= ARROWS_HEIGHT;

	s_configs.left.generic.type		= MTYPE_BITMAP;
	s_configs.left.generic.flags	= QMF_LEFT_JUSTIFY|QMF_PULSEIFFOCUS|QMF_MOUSEONLY;
	s_configs.left.generic.x		= 320-ARROWS_WIDTH/2;
	s_configs.left.generic.y		= 400;
	s_configs.left.generic.id		= ID_LEFT;
	s_configs.left.generic.callback	= LoadConfig_MenuEvent;
	s_configs.left.width			= ARROWS_WIDTH/2;
	s_configs.left.height			= ARROWS_HEIGHT;
	s_configs.left.focuspic			= ART_ARROWLEFT;

	s_configs.right.generic.type	= MTYPE_BITMAP;
	s_configs.right.generic.flags	= QMF_LEFT_JUSTIFY|QMF_PULSEIFFOCUS|QMF_MOUSEONLY;
	s_configs.right.generic.x		= 320;
	s_configs.right.generic.y		= 400;
	s_configs.right.generic.id		= ID_RIGHT;
	s_configs.right.generic.callback = LoadConfig_MenuEvent;
	s_configs.right.width			= ARROWS_WIDTH/2;
	s_configs.right.height			= ARROWS_HEIGHT;
	s_configs.right.focuspic		= ART_ARROWRIGHT;

	s_configs.back.generic.type		= MTYPE_PTEXT;
	s_configs.back.generic.flags	= QMF_LEFT_JUSTIFY|QMF_PULSEIFFOCUS;
	s_configs.back.generic.id		= ID_BACK;
	s_configs.back.generic.callback	= LoadConfig_MenuEvent;
	s_configs.back.generic.x		= 32;
	s_configs.back.generic.y		= 480-36;
	s_configs.back.string			= "back";
	s_configs.back.color			= tdc_text_color;
	s_configs.back.style			= UI_LEFT;

	s_configs.go.generic.type		= MTYPE_BITMAP;
	s_configs.go.generic.name		= ART_FIGHT0;
	s_configs.go.generic.flags		= QMF_RIGHT_JUSTIFY|QMF_PULSEIFFOCUS;
	s_configs.go.generic.id			= ID_GO;
	s_configs.go.generic.callback	= LoadConfig_MenuEvent;
	s_configs.go.generic.x			= 640;
	s_configs.go.generic.y			= 480-64;
	s_configs.go.width				= 128;
	s_configs.go.height				= 64;
	s_configs.go.focuspic			= ART_FIGHT1;

	// scan for configs
	s_configs.list.generic.type		= MTYPE_SCROLLLIST;
	s_configs.list.generic.flags	= QMF_PULSEIFFOCUS;
	s_configs.list.generic.callback	= LoadConfig_MenuEvent;
	s_configs.list.generic.id		= ID_LIST;
	s_configs.list.generic.x		= 118;
	s_configs.list.generic.y		= 130;
	s_configs.list.width			= 16;
	s_configs.list.height			= 14;
	s_configs.list.numitems			= trap_FS_GetFileList( "", "cfg", s_configs.names, NAMEBUFSIZE );
	s_configs.list.itemnames		= (const char **)s_configs.configlist;
	s_configs.list.columns			= 3;

	if (!s_configs.list.numitems) {
		strcpy(s_configs.names,"No Files Found.");
		s_configs.list.numitems = 1;

		//degenerate case, not selectable
		s_configs.go.generic.flags |= (QMF_INACTIVE|QMF_HIDDEN);
	}
	else if (s_configs.list.numitems > MAX_CONFIGS)
		s_configs.list.numitems = MAX_CONFIGS;
	
	configname = s_configs.names;
	for ( i = 0; i < s_configs.list.numitems; i++ ) {
		s_configs.list.itemnames[i] = configname;
		
		// strip extension
		len = strlen( configname );
		if (!Q_stricmp(configname +  len - 4,".cfg"))
			configname[len-4] = '\0';

		Q_strupr(configname);

		configname += len + 1;
	}

	Menu_AddItem( &s_configs.menu, &s_configs.banner );
	Menu_AddItem( &s_configs.menu, &s_configs.background );
	Menu_AddItem( &s_configs.menu, &s_configs.list );
	Menu_AddItem( &s_configs.menu, &s_configs.arrows );
	Menu_AddItem( &s_configs.menu, &s_configs.left );
	Menu_AddItem( &s_configs.menu, &s_configs.right );
	Menu_AddItem( &s_configs.menu, &s_configs.back );
	Menu_AddItem( &s_configs.menu, &s_configs.go );
}

/*
=================
UI_LoadConfig_Cache
=================
*/
void UI_LoadConfig_Cache( void ) {
	trap_R_RegisterShaderNoMip( BACKGROUND );
	trap_R_RegisterShaderNoMip( ART_ARROWS );
	trap_R_RegisterShaderNoMip( ART_ARROWLEFT );
	trap_R_RegisterShaderNoMip( ART_ARROWRIGHT );
}


/*
===============
UI_LoadConfigMenu
===============
*/
void UI_LoadConfigMenu( void ) {
	LoadConfig_MenuInit();
	UI_PushMenu( &s_configs.menu );
}
